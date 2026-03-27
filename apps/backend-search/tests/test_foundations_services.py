"""Unit tests for Supertab foundation services."""

from recipe_search_agent.access_service import AccessService
from recipe_search_agent.entitlements_service import EntitlementsService
from recipe_search_agent.identity_service import IdentityService
from recipe_search_agent.purchase_sync_service import PurchaseSyncService


class FakeIdentityRepository:
    def __init__(self):
        self.users = {}
        self.identities = {}

    def get_user(self, user_id):
        return self.users.get(user_id)

    def get_external_identity(self, provider, external_subject_id):
        return self.identities.get((provider, external_subject_id))

    def create_user(self, payload):
        self.users[payload["id"]] = payload
        return payload

    def create_external_identity(self, payload):
        self.identities[(payload["provider"], payload["external_subject_id"])] = payload
        return payload


class FakeEntitlementsService:
    def __init__(self, *, offering=None, entitlement=None, active_session=None):
        self.offering = offering
        self.entitlement = entitlement
        self.active_session = active_session
        self.owned_recipes = []

    def get_recipe(self, recipe_slug_or_id):
        return {
            "id": "recipe-uuid-1",
            "slug": recipe_slug_or_id,
            "status": "published",
            "metadata": {},
        }

    def get_recipe_offering(self, recipe_id):
        return self.offering

    def get_active_entitlement(self, user_id, recipe_id):
        return self.entitlement

    def get_active_session(self, user_id, recipe_id):
        return self.active_session

    def list_owned_recipes(self, user_id):
        return list(self.owned_recipes)


class FakeMonetizationRepository:
    def __init__(self):
        self.purchase = None
        self.entitlement = None

    def get_recipe(self, recipe_slug_or_id):
        return {"id": "recipe-uuid-1", "slug": recipe_slug_or_id}

    def get_active_offering(self, recipe_id):
        return {
            "id": "offering-1",
            "content_key": "recipe:avocado-toast:cook",
            "is_free": False,
        }

    def get_purchase_by_provider_id(self, provider, provider_purchase_id):
        return self.purchase

    def create_purchase(self, payload):
        self.purchase = payload
        return payload

    def get_active_entitlement_by_content_key(self, user_id, content_key):
        return self.entitlement

    def create_entitlement(self, payload):
        self.entitlement = payload
        return payload


class FakeOwnedRecipesRepository:
    def __init__(self, *, active_sessions=None, fail_sessions=False):
        self._active_sessions = active_sessions or []
        self._fail_sessions = fail_sessions

    def list_active_entitlements(self, user_id):
        return [
            {
                "id": "ent-1",
                "user_id": user_id,
                "recipe_id": "recipe-uuid-1",
                "purchase_id": "purchase-1",
                "provider_content_key": "recipe:banana-bread:cook",
                "status": "active",
                "granted_at": "2026-03-11T20:00:00Z",
                "expires_at": None,
                "recurs_at": None,
            }
        ]

    def get_recipes_by_ids(self, recipe_ids):
        return [
            {
                "id": "recipe-uuid-1",
                "slug": "banana-bread",
                "status": "published",
                "metadata": {
                    "title": "Banana Bread",
                    "description": "Moist and comforting.",
                    "categories": ["Baking"],
                    "image_url": "https://example.com/banana-bread.jpg",
                },
            }
        ]

    def get_purchases_by_ids(self, purchase_ids):
        return [
            {
                "id": "purchase-1",
                "status": "completed",
                "purchased_at": "2026-03-11T20:00:00Z",
                "completed_at": "2026-03-11T20:00:00Z",
            }
        ]

    def list_latest_active_sessions(self, user_id, recipe_ids):
        if self._fail_sessions:
            raise TimeoutError("session lookup timed out")
        return list(self._active_sessions)


def test_identity_service_reuses_existing_external_identity():
    repository = FakeIdentityRepository()
    service = IdentityService(repository=repository)

    first = service.get_or_create_user_from_supertab(
        "subject-123",
        {"email": "jamie@example.com", "firstName": "Jamie", "lastName": "Oliver"},
    )
    second = service.get_or_create_user_from_supertab(
        "subject-123",
        {"email": "jamie@example.com", "firstName": "Jamie", "lastName": "Oliver"},
    )

    assert first["id"] == second["id"]
    assert len(repository.users) == 1
    assert len(repository.identities) == 1


def test_access_service_returns_free_state():
    service = AccessService(
        entitlements_service=FakeEntitlementsService(
            offering={"id": "off-1", "is_free": True, "content_key": "recipe:free:cook"}
        )
    )

    access = service.get_recipe_access("fluffy-pancakes", user_id="user-1")

    assert access["accessState"] == "free"
    assert access["offering"]["isFree"] is True


def test_access_service_returns_locked_state_without_entitlement():
    service = AccessService(
        entitlements_service=FakeEntitlementsService(
            offering={"id": "off-2", "is_free": False, "content_key": "recipe:paid:cook"}
        )
    )

    access = service.get_recipe_access("avocado-toast", user_id="user-1")

    assert access["accessState"] == "locked"
    assert access["entitlement"] is None


def test_access_service_returns_owned_state_with_entitlement_and_session():
    service = AccessService(
        entitlements_service=FakeEntitlementsService(
            offering={"id": "off-3", "is_free": False, "content_key": "recipe:paid:cook"},
            entitlement={"id": "ent-1", "status": "active", "granted_at": "now"},
            active_session={
                "id": "sess-1",
                "status": "paused",
                "current_step_index": 2,
                "completed_step_ids": ["prep"],
                "last_active_at": "now",
            },
        )
    )

    access = service.get_recipe_access("avocado-toast", user_id="user-1")

    assert access["accessState"] == "owned"
    assert access["activeSession"]["sessionId"] == "sess-1"


def test_purchase_sync_service_creates_purchase_and_entitlement_for_completed_purchase():
    repository = FakeMonetizationRepository()
    service = PurchaseSyncService(repository=repository)

    result = service.sync_supertab_state(
        user_id="user-1",
        recipe_slug_or_id="avocado-toast",
        purchase={
            "id": "purchase-1",
            "offeringId": "supertab-offering-1",
            "status": "completed",
            "price": {"amount": 199, "currencyCode": "USD"},
        },
        prior_entitlement=[],
    )

    assert result["purchase"]["provider_purchase_id"] == "purchase-1"
    assert result["entitlement"]["provider_content_key"] == "recipe:avocado-toast:cook"


def test_access_service_lists_owned_recipes():
    entitlements_service = FakeEntitlementsService()
    entitlements_service.owned_recipes = [
        {
            "recipeId": "banana-bread",
            "recipeUuid": "recipe-uuid-1",
            "title": "Banana Bread",
            "description": "Moist and comforting.",
            "category": "Baking",
            "imageUrl": "https://example.com/banana-bread.jpg",
            "purchaseStatus": "completed",
            "ownedAt": "2026-03-11T20:00:00Z",
            "expiresAt": None,
            "lastCookedAt": "2026-03-11T21:00:00Z",
            "activeSession": {
                "sessionId": "sess-1",
                "status": "active",
                "currentStepIndex": 1,
                "completedStepIds": ["prep"],
                "lastActiveAt": "2026-03-11T21:00:00Z",
            },
        }
    ]
    service = AccessService(entitlements_service=entitlements_service)

    recipes = service.list_owned_recipes("user-1")

    assert len(recipes) == 1
    assert recipes[0]["recipeId"] == "banana-bread"
    assert recipes[0]["purchaseStatus"] == "completed"
    assert recipes[0]["activeSession"]["sessionId"] == "sess-1"


def test_entitlements_service_lists_owned_recipes_without_sessions_when_lookup_times_out():
    service = EntitlementsService(repository=FakeOwnedRecipesRepository(fail_sessions=True))

    recipes = service.list_owned_recipes("user-1")

    assert len(recipes) == 1
    assert recipes[0]["recipeId"] == "banana-bread"
    assert recipes[0]["purchaseStatus"] == "completed"
    assert recipes[0]["lastCookedAt"] is None
    assert recipes[0]["activeSession"] is None
