#!/usr/bin/env python3
"""
Comprehensive unit tests for modules.handlers.utils
Testing utility functions for file operations, output formatting, and message analysis.
"""

import os
import shutil
from unittest.mock import MagicMock, patch

import pytest

from modules.handlers.utils import (
    get_terminal_width,
    print_separator,
    get_output_path,
    sanitize_target_name,
)


class TestGetTerminalWidth:
    """Test terminal width utility function."""

    def test_get_terminal_width_default(self):
        """Test terminal width returns default when no terminal available."""
        with patch("shutil.get_terminal_size") as mock_size:
            mock_size.side_effect = OSError("No terminal")
            width = get_terminal_width(80)
            assert width == 80

    def test_get_terminal_width_custom_default(self):
        """Test terminal width with custom default value."""
        with patch("shutil.get_terminal_size") as mock_size:
            mock_size.side_effect = OSError("No terminal")
            width = get_terminal_width(120)
            assert width == 120

    def test_get_terminal_width_actual_size(self):
        """Test terminal width from actual terminal size."""
        with patch("shutil.get_terminal_size") as mock_size:
            mock_size.return_value = os.terminal_size((100, 24))
            width = get_terminal_width(80)
            # Should return actual size minus 2
            assert width == 80  # min(98, 80) = 80

    def test_get_terminal_width_minimum_constraint(self):
        """Test terminal width respects minimum of 40."""
        with patch("shutil.get_terminal_size") as mock_size:
            mock_size.return_value = os.terminal_size((30, 24))
            width = get_terminal_width(80)
            assert width == 40  # Should enforce minimum of 40

    def test_get_terminal_width_value_error(self):
        """Test terminal width handles ValueError gracefully."""
        with patch("shutil.get_terminal_size") as mock_size:
            mock_size.side_effect = ValueError("Invalid terminal")
            width = get_terminal_width(80)
            assert width == 80


class TestPrintSeparator:
    """Test separator printing utility function."""

    def test_print_separator_default(self, capsys):
        """Test printing separator with default character."""
        with patch("modules.handlers.utils.get_terminal_width", return_value=80):
            print_separator()
            captured = capsys.readouterr()
            assert "─" * 80 in captured.out

    def test_print_separator_custom_char(self, capsys):
        """Test printing separator with custom character."""
        with patch("modules.handlers.utils.get_terminal_width", return_value=50):
            print_separator(char="=")
            captured = capsys.readouterr()
            assert "=" * 50 in captured.out

    def test_print_separator_with_colors(self, capsys):
        """Test printing separator with color codes."""
        with patch("modules.handlers.utils.get_terminal_width", return_value=40):
            print_separator(char="-", color_start="\033[31m", color_end="\033[0m")
            captured = capsys.readouterr()
            assert "\033[31m" in captured.out
            assert "-" * 40 in captured.out
            assert "\033[0m" in captured.out

    def test_print_separator_empty_colors(self, capsys):
        """Test printing separator with empty color strings."""
        with patch("modules.handlers.utils.get_terminal_width", return_value=60):
            print_separator(char="*", color_start="", color_end="")
            captured = capsys.readouterr()
            assert "*" * 60 in captured.out


class TestGetOutputPath:
    """Test output path generation utility function."""

    def test_get_output_path_basic(self):
        """Test basic output path generation."""
        path = get_output_path("target", "OP_123", base_dir="/tmp/test")
        expected = os.path.join("/tmp/test", "target", "OP_123")
        assert path == expected

    def test_get_output_path_with_subdir(self):
        """Test output path generation with subdirectory."""
        path = get_output_path("target", "OP_123", subdir="logs", base_dir="/tmp/test")
        expected = os.path.join("/tmp/test", "target", "OP_123", "logs")
        assert path == expected

    def test_get_output_path_default_base_dir(self):
        """Test output path with default base directory."""
        with patch("os.getcwd", return_value="/home/user"):
            path = get_output_path("target", "OP_123")
            expected = os.path.join("/home/user", "outputs", "target", "OP_123")
            assert path == expected

    def test_get_output_path_empty_subdir(self):
        """Test output path with empty subdirectory string."""
        path = get_output_path("target", "OP_123", subdir="", base_dir="/tmp/test")
        expected = os.path.join("/tmp/test", "target", "OP_123")
        assert path == expected

    def test_get_output_path_complex_structure(self):
        """Test output path with nested subdirectory."""
        path = get_output_path(
            "example_com", "OP_456", subdir="scan/results", base_dir="/output"
        )
        expected = os.path.join("/output", "example_com", "OP_456", "scan/results")
        assert path == expected


class TestSanitizeTargetName:
    """Test target name sanitization utility function."""

    def test_sanitize_http_url(self):
        """Test sanitizing HTTP URL."""
        result = sanitize_target_name("http://example.com")
        assert result == "example.com"

    def test_sanitize_https_url(self):
        """Test sanitizing HTTPS URL."""
        result = sanitize_target_name("https://example.com")
        assert result == "example.com"

    def test_sanitize_ftp_url(self):
        """Test sanitizing FTP URL."""
        result = sanitize_target_name("ftp://ftp.example.com")
        assert result == "ftp.example.com"

    def test_sanitize_url_with_path(self):
        """Test sanitizing URL with path components."""
        result = sanitize_target_name("https://example.com/path/to/resource")
        assert result == "example.com"

    def test_sanitize_url_with_query(self):
        """Test sanitizing URL with query parameters."""
        result = sanitize_target_name("https://example.com?param=value")
        assert result == "example.com"

    def test_sanitize_url_with_port(self):
        """Test sanitizing URL with port number."""
        result = sanitize_target_name("https://example.com:8080")
        assert result == "example.com_8080"

    def test_sanitize_ip_address(self):
        """Test sanitizing IP address."""
        result = sanitize_target_name("192.168.1.1")
        assert result == "192.168.1.1"

    def test_sanitize_ip_with_port(self):
        """Test sanitizing IP address with port."""
        result = sanitize_target_name("192.168.1.1:8080")
        assert result == "192.168.1.1_8080"

    def test_sanitize_unsafe_characters(self):
        """Test sanitizing string with unsafe characters."""
        result = sanitize_target_name("example@test#domain")
        assert result == "example_test_domain"

    def test_sanitize_consecutive_underscores(self):
        """Test that consecutive underscores are collapsed."""
        result = sanitize_target_name("example___test___domain")
        assert result == "example_test_domain"

    def test_sanitize_leading_trailing_chars(self):
        """Test removal of leading/trailing underscores and dots."""
        result = sanitize_target_name("_example.com_")
        assert result == "example.com"

    def test_sanitize_complex_url(self):
        """Test sanitizing complex URL with multiple components."""
        result = sanitize_target_name(
            "https://sub.example.com:8443/path?query=value#fragment"
        )
        assert result == "sub.example.com_8443"

    def test_sanitize_empty_string(self):
        """Test sanitizing empty string."""
        result = sanitize_target_name("")
        assert result == "unknown_target"

    def test_sanitize_domain_with_subdomain(self):
        """Test sanitizing domain with subdomain."""
        result = sanitize_target_name("api.v2.example.com")
        assert result == "api.v2.example.com"

    def test_sanitize_localhost(self):
        """Test sanitizing localhost."""
        result = sanitize_target_name("http://localhost:3000")
        assert result == "localhost_3000"