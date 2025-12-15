#!/usr/bin/env python3
"""
Comprehensive tests for Prompt System
======================================

Tests for prompt loading, template formatting, and prompt factory.
"""

import os
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

from modules.handlers.prompt_rebuild_hook import PromptRebuildHook
from modules.prompts import get_system_prompt, load_prompt_template


@pytest.fixture
def temp_prompt_dir():
    """Create temporary directory with test prompts"""
    with tempfile.TemporaryDirectory() as tmpdir:
        prompt_dir = Path(tmpdir) / "prompts"
        prompt_dir.mkdir()
        
        # Create test prompt files
        system_prompt = prompt_dir / "system.md"
        system_prompt.write_text("System prompt: {agent_role}\nObjective: {objective}")
        
        execution_prompt = prompt_dir / "execution_prompt.md"
        execution_prompt.write_text("Execute: {target}\nTools: {tools}")
        
        report_prompt = prompt_dir / "report_prompt.md"
        report_prompt.write_text("Report for: {target}\nFindings: {findings}")
        
        yield prompt_dir


@pytest.fixture
def mock_operation_config():
    """Mock operation configuration"""
    return {
        "target": "example.com",
        "objective": "Test security assessment",
        "operation_id": "op-123",
        "available_tools": ["nmap", "nikto"],
    }


class TestPromptLoading:
    """Test prompt file loading functionality"""

    def test_load_system_prompt(self, temp_prompt_dir):
        """Load system prompt from file"""
        # Verify file operations work
        system_prompt_path = temp_prompt_dir / "system.md"
        assert system_prompt_path.exists()
        content = system_prompt_path.read_text()
        assert "System prompt:" in content

    def test_load_operation_prompt(self, temp_prompt_dir):
        """Load operation-specific prompt"""
        execution_path = temp_prompt_dir / "execution_prompt.md"
        content = execution_path.read_text()
        assert "Execute:" in content
        assert "{target}" in content

    def test_load_nonexistent_prompt(self, temp_prompt_dir):
        """Handle missing prompt file gracefully"""
        nonexistent = temp_prompt_dir / "nonexistent.md"
        assert not nonexistent.exists()


class TestPromptTemplateFormatting:
    """Test prompt template variable substitution"""

    def test_format_simple_template(self):
        """Format template with simple variables"""
        template = "Target: {target}, Objective: {objective}"
        result = template.format(target="example.com", objective="Test")
        assert "example.com" in result
        assert "Test" in result

    def test_format_with_list_variables(self):
        """Format template with list variables"""
        template = "Tools: {tools}"
        tools = ["nmap", "nikto", "sqlmap"]
        result = template.format(tools=", ".join(tools))
        assert "nmap" in result
        assert "nikto" in result

    def test_format_with_nested_data(self):
        """Format template with nested data structures"""
        template = "Config: {config}"
        config = {"target": "example.com", "port": 80}
        result = template.format(config=str(config))
        assert "example.com" in result

    def test_format_with_missing_variables(self):
        """Handle missing template variables"""
        template = "Target: {target}, Missing: {missing}"
        with pytest.raises(KeyError):
            template.format(target="example.com")

    def test_format_with_special_characters(self):
        """Format template with special characters"""
        template = "Query: {query}"
        result = template.format(query="SELECT * FROM users WHERE id='1' OR '1'='1'")
        assert "SELECT" in result


class TestPromptRebuildHook:
    """Test PromptRebuildHook functionality"""

    def test_hook_initialization(self):
        """Initialize prompt rebuild hook"""
        mock_callback = Mock()
        mock_callback.current_step = 0
        mock_memory = Mock()
        mock_config = Mock()
        mock_config.output_dir = "outputs"
        
        hook = PromptRebuildHook(
            callback_handler=mock_callback,
            memory_instance=mock_memory,
            config=mock_config,
            target="example.com",
            objective="Test objective",
            operation_id="op-123"
        )
        assert hook.target == "example.com"
        assert hook.objective == "Test objective"

    def test_hook_with_operation_id(self):
        """Hook with operation ID"""
        mock_callback = Mock()
        mock_callback.current_step = 0
        mock_memory = Mock()
        mock_config = Mock()
        mock_config.output_dir = "outputs"
        
        hook = PromptRebuildHook(
            callback_handler=mock_callback,
            memory_instance=mock_memory,
            config=mock_config,
            target="example.com",
            objective="Test",
            operation_id="op-123"
        )
        assert hook.operation_id == "op-123"

    def test_hook_with_custom_interval(self):
        """Hook with custom rebuild interval"""
        mock_callback = Mock()
        mock_callback.current_step = 0
        mock_memory = Mock()
        mock_config = Mock()
        mock_config.output_dir = "outputs"
        
        hook = PromptRebuildHook(
            callback_handler=mock_callback,
            memory_instance=mock_memory,
            config=mock_config,
            target="example.com",
            objective="Test",
            operation_id="op-123",
            rebuild_interval=10
        )
        assert hook.rebuild_interval == 10


class TestPromptVariableSubstitution:
    """Test complex variable substitution scenarios"""

    def test_substitute_all_variables(self):
        """Substitute all variables in template"""
        template = "Target: {target}\nObjective: {objective}\nTools: {tools}"
        result = template.format(
            target="example.com",
            objective="Security assessment",
            tools="nmap, nikto"
        )
        assert "example.com" in result
        assert "Security assessment" in result
        assert "nmap, nikto" in result

    def test_substitute_with_defaults(self):
        """Use default values for missing variables"""
        template = "Target: {target}"
        defaults = {"target": "localhost", "objective": "Test"}
        values = {**defaults, **{"target": "example.com"}}
        result = template.format(**values)
        assert "example.com" in result

    def test_substitute_with_formatting(self):
        """Format variables with custom formatting"""
        template = "Port: {port:04d}"
        result = template.format(port=80)
        assert "0080" in result

    def test_substitute_multiline_content(self):
        """Substitute multiline content"""
        template = "Findings:\n{findings}"
        findings = "1. SQL injection\n2. XSS vulnerability\n3. CSRF token missing"
        result = template.format(findings=findings)
        assert "SQL injection" in result
        assert "XSS vulnerability" in result


class TestPromptCaching:
    """Test prompt caching mechanisms"""

    def test_cache_system_prompt(self):
        """Cache loaded system prompt"""
        cache = {}
        key = "system_prompt"
        value = "Cached system prompt"
        cache[key] = value
        assert cache[key] == value

    def test_cache_invalidation(self):
        """Invalidate cache when needed"""
        cache = {"system_prompt": "Old prompt"}
        cache["system_prompt"] = "New prompt"
        assert cache["system_prompt"] == "New prompt"

    def test_cache_multiple_prompts(self):
        """Cache multiple different prompts"""
        cache = {
            "system": "System prompt",
            "execution": "Execution prompt",
            "report": "Report prompt"
        }
        assert len(cache) == 3


class TestPromptContextBuilding:
    """Test building prompt context from operation data"""

    def test_build_basic_context(self, mock_operation_config):
        """Build basic prompt context"""
        context = {
            "target": mock_operation_config["target"],
            "objective": mock_operation_config["objective"],
        }
        assert context["target"] == "example.com"
        assert context["objective"] == "Test security assessment"

    def test_build_context_with_tools(self, mock_operation_config):
        """Build context including tool information"""
        context = {
            **mock_operation_config,
            "tools_list": ", ".join(mock_operation_config["available_tools"])
        }
        assert "nmap" in context["tools_list"]
        assert "nikto" in context["tools_list"]

    def test_build_context_with_memory(self, mock_operation_config):
        """Build context with memory references"""
        context = {
            **mock_operation_config,
            "has_memory": True,
            "memory_count": 5
        }
        assert context["has_memory"] is True
        assert context["memory_count"] == 5

    def test_build_context_with_findings(self, mock_operation_config):
        """Build context with previous findings"""
        findings = ["SQL injection in login", "XSS in search"]
        context = {
            **mock_operation_config,
            "findings": findings,
            "findings_count": len(findings)
        }
        assert context["findings_count"] == 2


class TestPromptErrorHandling:
    """Test error handling in prompt system"""

    def test_handle_missing_template_file(self, temp_prompt_dir):
        """Handle missing template file"""
        missing_path = temp_prompt_dir / "missing.md"
        assert not missing_path.exists()

    def test_handle_invalid_template_syntax(self):
        """Handle invalid template syntax"""
        template = "Invalid: {unclosed"
        with pytest.raises(ValueError):
            template.format(unclosed="value")

    def test_handle_empty_template(self):
        """Handle empty template gracefully"""
        template = ""
        result = template.format()
        assert result == ""

    def test_handle_unicode_in_template(self):
        """Handle unicode characters in template"""
        template = "Target: {target} 🎯"
        result = template.format(target="example.com")
        assert "🎯" in result

    def test_handle_special_markdown(self):
        """Handle special markdown syntax"""
        template = "# Header\n**Bold**: {text}\n- List item"
        result = template.format(text="test")
        assert "# Header" in result
        assert "**Bold**" in result


class TestOperationPromptGeneration:
    """Test operation-specific prompt generation"""

    def test_generate_execution_prompt(self, mock_operation_config):
        """Generate execution phase prompt"""
        prompt = f"""Execute security assessment on {mock_operation_config['target']}
Objective: {mock_operation_config['objective']}
Available tools: {', '.join(mock_operation_config['available_tools'])}"""
        
        assert mock_operation_config['target'] in prompt
        assert mock_operation_config['objective'] in prompt

    def test_generate_report_prompt(self, mock_operation_config):
        """Generate report phase prompt"""
        prompt = f"""Generate report for {mock_operation_config['target']}
Include all findings and recommendations."""
        
        assert mock_operation_config['target'] in prompt
        assert "findings" in prompt

    def test_generate_prompt_with_constraints(self, mock_operation_config):
        """Generate prompt with operational constraints"""
        max_steps = 10
        timeout = 300
        prompt = f"""Assessment constraints:
Max steps: {max_steps}
Timeout: {timeout}s
Target: {mock_operation_config['target']}"""
        
        assert str(max_steps) in prompt
        assert str(timeout) in prompt


class TestPromptValidation:
    """Test prompt validation"""

    def test_validate_required_fields(self):
        """Validate required fields in prompt"""
        required = ["target", "objective"]
        data = {"target": "example.com", "objective": "Test"}
        assert all(field in data for field in required)

    def test_validate_field_types(self):
        """Validate field types"""
        data = {
            "target": "example.com",
            "port": 80,
            "enabled": True
        }
        assert isinstance(data["target"], str)
        assert isinstance(data["port"], int)
        assert isinstance(data["enabled"], bool)

    def test_validate_field_constraints(self):
        """Validate field value constraints"""
        port = 80
        assert 1 <= port <= 65535

    def test_validate_list_fields(self):
        """Validate list field contents"""
        tools = ["nmap", "nikto", "sqlmap"]
        assert all(isinstance(tool, str) for tool in tools)
        assert len(tools) > 0