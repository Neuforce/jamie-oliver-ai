"""Tests for verbal consent intent classification."""

from recipe_search_agent.consent_intent import classify_consent_utterance


def test_grant_phrases():
    assert classify_consent_utterance("yes please") == "grant"
    assert classify_consent_utterance("put it on my tab") == "grant"
    assert classify_consent_utterance("go ahead") == "grant"


def test_decline_phrases():
    assert classify_consent_utterance("no thanks") == "decline"
    assert classify_consent_utterance("not now") == "decline"
    assert classify_consent_utterance("cancel") == "decline"


def test_ambiguous_phrases():
    assert classify_consent_utterance("maybe later") == "ambiguous"
    assert classify_consent_utterance("tell me more") == "ambiguous"
