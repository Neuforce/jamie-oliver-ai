"""Tests for verbal purchase-hold undo intent classification."""

from recipe_search_agent.undo_intent import classify_undo_utterance


def test_undo_positive_phrases():
    assert classify_undo_utterance("undo")
    assert classify_undo_utterance("undo that.")
    assert classify_undo_utterance("undo it")
    assert classify_undo_utterance("cancel that")
    assert classify_undo_utterance("cancel it!")
    assert classify_undo_utterance("stop")
    assert classify_undo_utterance("don't do it")
    assert classify_undo_utterance("don't charge me")
    assert classify_undo_utterance("take it back")
    assert classify_undo_utterance("never mind")


def test_undo_negative_phrase():
    assert not classify_undo_utterance("what should I cook tonight?")
