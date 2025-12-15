#!/usr/bin/env python3
"""
Comprehensive tests for Evaluation Module
==========================================

Tests for trace parsing, metrics computation, and evaluation management.
"""

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from modules.evaluation.trace_parser import (
    TraceParser,
    ParsedTrace,
    ParsedMessage,
    ParsedToolCall,
)
from modules.evaluation.evaluation import BooAgentEvaluator


# Test Fixtures
@pytest.fixture
def mock_trace():
    """Create a mock Langfuse trace"""
    trace = Mock()
    trace.id = "test-trace-123"
    trace.name = "Security Assessment - example.com - op-456"
    trace.metadata = {
        "attributes": {"objective.description": "Test SQL injection vulnerability"},
        "objective": "Security assessment"
    }
    trace.input = [{"content": "Objective: Test SQL injection vulnerability"}]
    trace.output = "Assessment completed successfully"
    trace.observations = []
    return trace


@pytest.fixture
def mock_observation():
    """Create mock observation"""
    obs = Mock()
    obs.id = "obs-123"
    obs.type = "GENERATION"
    obs.name = "llm_generation"
    obs.input = "Test input"
    obs.output = {"content": "Test response"}
    obs.startTime = 1234567890.0
    obs.model = "claude-3"
    return obs


@pytest.fixture
def mock_tool_observation():
    """Create mock tool observation"""
    obs = Mock()
    obs.id = "tool-obs-123"
    obs.type = "SPAN"
    obs.name = "Tool: mem0_memory"
    obs.input = {"query": "test query"}
    obs.output = "Memory result"
    obs.startTime = 1234567891.0
    obs.statusMessage = None
    return obs


@pytest.fixture
def trace_parser():
    """Create trace parser instance"""
    return TraceParser(llm=Mock(), langfuse_client=Mock())


class TestParsedTrace:
    """Test ParsedTrace data class and properties"""

    def test_is_multi_turn_with_tool_calls(self):
        """Multi-turn classification based on tool calls"""
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[],
            tool_calls=[
                ParsedToolCall("tool1", {}),
                ParsedToolCall("tool2", {}),
            ]
        )
        assert trace.is_multi_turn is True

    def test_is_multi_turn_with_messages(self):
        """Multi-turn classification based on message count"""
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[
                ParsedMessage("user", "Message 1"),
                ParsedMessage("assistant", "Response 1"),
                ParsedMessage("user", "Message 2"),
            ],
            tool_calls=[]
        )
        assert trace.is_multi_turn is True

    def test_is_single_turn(self):
        """Single-turn classification"""
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[ParsedMessage("user", "Single message")],
            tool_calls=[]
        )
        assert trace.is_multi_turn is False

    def test_has_tool_usage(self):
        """Check tool usage detection"""
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[],
            tool_calls=[ParsedToolCall("tool1", {})]
        )
        assert trace.has_tool_usage is True

    def test_get_tool_outputs(self):
        """Test tool output extraction"""
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[],
            tool_calls=[
                ParsedToolCall("nmap", {"target": "test"}, output="Port 80 open"),
                ParsedToolCall("nikto", {"target": "test"}, output="Found vulnerabilities"),
            ]
        )
        outputs = trace.get_tool_outputs()
        assert len(outputs) == 2
        assert "nmap" in outputs[0]
        assert "Port 80 open" in outputs[0]

    def test_get_tool_outputs_with_limit(self):
        """Test tool output limiting"""
        tool_calls = [ParsedToolCall(f"tool{i}", {}, output=f"Output {i}") for i in range(15)]
        trace = ParsedTrace(
            trace_id="test-123",
            trace_name="Test",
            objective="Test objective",
            messages=[],
            tool_calls=tool_calls
        )
        outputs = trace.get_tool_outputs(limit=5)
        assert len(outputs) == 5


class TestTraceParserObjectiveExtraction:
    """Test objective extraction from various formats"""

    def test_extract_objective_from_metadata_attributes(self, trace_parser, mock_trace):
        """Extract objective from metadata attributes"""
        objective = trace_parser._extract_objective(mock_trace)
        assert objective == "Test SQL injection vulnerability"

    def test_extract_objective_from_metadata_direct(self, trace_parser):
        """Extract objective from direct metadata field"""
        trace = Mock()
        trace.metadata = {"objective": "Direct objective"}
        objective = trace_parser._extract_objective(trace)
        assert objective == "Direct objective"

    def test_extract_objective_from_input_dict(self, trace_parser):
        """Extract objective from input dictionary"""
        trace = Mock()
        trace.metadata = None
        trace.name = None
        trace.input = {"objective": "Input objective"}
        objective = trace_parser._extract_objective(trace)
        assert objective == "Input objective"

    def test_extract_objective_from_input_list(self, trace_parser):
        """Extract objective from input list content"""
        trace = Mock()
        trace.metadata = None
        trace.input = [{"content": "Objective: Test the application"}]
        objective = trace_parser._extract_objective(trace)
        assert objective == "Test the application"

    def test_extract_objective_from_trace_name(self, trace_parser):
        """Extract objective from trace name pattern"""
        trace = Mock()
        trace.metadata = None
        trace.input = None
        trace.name = "Security Assessment - example.com - op-123"
        objective = trace_parser._extract_objective(trace)
        assert "example.com" in objective

    def test_extract_objective_returns_none(self, trace_parser):
        """Return None when no objective found"""
        trace = Mock()
        trace.metadata = None
        trace.input = None
        trace.name = "Generic Trace"
        objective = trace_parser._extract_objective(trace)
        assert objective is None


class TestTraceParserMessageExtraction:
    """Test message extraction from traces"""

    def test_extract_messages_from_observations(self, trace_parser, mock_trace, mock_observation):
        """Extract messages from observations"""
        messages = trace_parser._extract_messages(mock_trace, [mock_observation])
        # Should have at least the objective message
        assert len(messages) > 0
        assert any("SQL injection" in msg.content for msg in messages)

    def test_parse_generation_observation(self, trace_parser, mock_observation):
        """Parse GENERATION type observation"""
        message = trace_parser._parse_observation_message(mock_observation)
        assert message is not None
        assert message.role == "assistant"
        assert "Test response" in message.content

    def test_parse_event_observation(self, trace_parser):
        """Parse EVENT type observation"""
        obs = Mock()
        obs.type = "EVENT"
        obs.input = "User input message"
        obs.startTime = 1234567890.0
        obs.id = "event-123"
        message = trace_parser._parse_observation_message(obs)
        assert message is not None
        assert message.role == "user"

    def test_extract_tool_as_message(self, trace_parser, mock_tool_observation):
        """Extract tool interaction as message"""
        message = trace_parser._extract_tool_as_message(mock_tool_observation)
        assert message is not None
        assert message.role == "system"
        assert "mem0_memory" in message.content

    def test_extract_content_from_dict_output(self, trace_parser):
        """Extract content from dictionary output"""
        output = {"content": [{"type": "text", "text": "Response text"}]}
        content = trace_parser._extract_content_from_output(output)
        assert content == "Response text"

    def test_extract_content_from_string_output(self, trace_parser):
        """Extract content from string output"""
        output = "Direct string response"
        content = trace_parser._extract_content_from_output(output)
        assert content == "Direct string response"


class TestTraceParserToolExtraction:
    """Test tool call extraction"""

    def test_extract_tool_calls_from_span(self, trace_parser, mock_trace, mock_tool_observation):
        """Extract tool calls from SPAN observations"""
        tool_calls = trace_parser._extract_tool_calls(mock_trace, [mock_tool_observation])
        assert len(tool_calls) > 0
        assert any("mem0_memory" in tc.name for tc in tool_calls)

    def test_parse_tool_observation(self, trace_parser, mock_tool_observation):
        """Parse tool observation"""
        tool_call = trace_parser._parse_tool_observation(mock_tool_observation)
        assert tool_call is not None
        assert "mem0_memory" in tool_call.name
        assert tool_call.output == "Memory result"

    def test_parse_tool_observation_from_dict(self, trace_parser):
        """Parse tool from dictionary format"""
        obs = Mock()
        obs.type = "TOOL"
        obs.name = "Tool: nmap"
        obs.input = {"target": "example.com"}
        obs.output = "Scan results"
        obs.startTime = 1234567890.0
        obs.statusMessage = None
        
        tool_call = trace_parser._parse_tool_observation(obs)
        assert tool_call is not None
        assert "nmap" in tool_call.name


class TestBooAgentEvaluator:
    """Test BooAgentEvaluator setup and configuration"""

    @patch('modules.evaluation.evaluation.Langfuse')
    @patch('modules.evaluation.evaluation.get_config')
    def test_evaluator_initialization_bedrock(self, mock_get_config, mock_langfuse):
        """Test evaluator initialization with Bedrock"""
        mock_config = Mock()
        mock_config.services.langfuse_url = "http://localhost:3000"
        mock_get_config.return_value = mock_config
        
        with patch.dict('os.environ', {'PROVIDER': 'bedrock'}):
            with patch('modules.evaluation.evaluation.ChatBedrock') as mock_bedrock:
                with patch('modules.evaluation.evaluation.BedrockEmbeddings'):
                    evaluator = BooAgentEvaluator()
                    assert evaluator.langfuse is not None
                    mock_bedrock.assert_called_once()

    @patch('modules.evaluation.evaluation.Langfuse')
    @patch('modules.evaluation.evaluation.get_config')
    def test_evaluator_initialization_ollama(self, mock_get_config, mock_langfuse):
        """Test evaluator initialization with Ollama"""
        mock_config = Mock()
        mock_config.services.langfuse_url = "http://localhost:3000"
        mock_get_config.return_value = mock_config
        
        with patch.dict('os.environ', {'PROVIDER': 'ollama'}):
            with patch('modules.evaluation.evaluation.ChatOllama') as mock_ollama:
                with patch('modules.evaluation.evaluation.OllamaEmbeddings'):
                    evaluator = BooAgentEvaluator()
                    assert evaluator.langfuse is not None
                    mock_ollama.assert_called_once()

    @patch('modules.evaluation.evaluation.Langfuse')
    @patch('modules.evaluation.evaluation.get_config')
    def test_evaluator_graceful_degradation(self, mock_get_config, mock_langfuse):
        """Test graceful degradation when Langfuse fails"""
        mock_config = Mock()
        mock_config.services.langfuse_url = "http://localhost:3000"
        mock_get_config.return_value = mock_config
        mock_langfuse.side_effect = Exception("Connection failed")
        
        with patch('modules.evaluation.evaluation.ChatBedrock'):
            with patch('modules.evaluation.evaluation.BedrockEmbeddings'):
                evaluator = BooAgentEvaluator()
                assert evaluator.langfuse is None
                assert evaluator.trace_parser is None

    @patch('modules.evaluation.evaluation.Langfuse')
    @patch('modules.evaluation.evaluation.get_config')
    def test_setup_metrics(self, mock_get_config, mock_langfuse):
        """Test metric setup"""
        mock_config = Mock()
        mock_config.services.langfuse_url = "http://localhost:3000"
        mock_get_config.return_value = mock_config
        
        with patch('modules.evaluation.evaluation.ChatBedrock'):
            with patch('modules.evaluation.evaluation.BedrockEmbeddings'):
                evaluator = BooAgentEvaluator()
                assert hasattr(evaluator, 'tool_selection_accuracy')
                assert hasattr(evaluator, 'evidence_quality')
                assert hasattr(evaluator, 'methodology_adherence')


class TestTraceParserEdgeCases:
    """Test edge cases in trace parsing"""

    def test_parse_empty_trace(self, trace_parser):
        """Handle empty trace gracefully"""
        trace = Mock()
        trace.id = "empty-123"
        trace.name = "Empty"
        trace.metadata = None
        trace.input = None
        trace.output = None
        trace.observations = []
        
        parsed = trace_parser.parse_trace(trace)
        assert parsed is not None
        assert parsed.trace_id == "empty-123"

    def test_parse_trace_with_error(self, trace_parser):
        """Handle parsing errors gracefully"""
        trace = Mock()
        trace.id.side_effect = Exception("Attribute error")
        
        parsed = trace_parser.parse_trace(trace)
        assert parsed is None

    def test_fetch_observations_already_objects(self, trace_parser):
        """Handle observations that are already objects"""
        mock_obs = Mock()
        mock_obs.type = "GENERATION"
        
        trace = Mock()
        trace.observations = [mock_obs]
        
        observations = trace_parser._fetch_observations(trace)
        assert len(observations) == 1
        assert observations[0] == mock_obs

    def test_extract_content_from_complex_output(self, trace_parser):
        """Extract content from complex nested output"""
        output = {
            "content": [
                {"type": "text", "text": "Part 1"},
                {"type": "text", "text": "Part 2"}
            ]
        }
        content = trace_parser._extract_content_from_output(output)
        assert "Part 1" in content
        assert "Part 2" in content


class TestTraceParserToolFiltering:
    """Test security tool filtering"""

    def test_filter_security_tools(self, trace_parser):
        """Only extract security-relevant tools"""
        obs1 = Mock()
        obs1.type = "SPAN"
        obs1.name = "Tool: mem0_memory"
        obs1.input = {}
        obs1.output = "result"
        
        obs2 = Mock()
        obs2.type = "SPAN"
        obs2.name = "Tool: some_other_tool"
        obs2.input = {}
        obs2.output = "result"
        
        # mem0_memory should be extracted (in security_tools)
        msg1 = trace_parser._extract_tool_as_message(obs1)
        assert msg1 is not None
        
        # some_other_tool should be filtered out
        msg2 = trace_parser._extract_tool_as_message(obs2)
        assert msg2 is None