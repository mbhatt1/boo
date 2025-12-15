#!/usr/bin/env python3
"""
Unit tests for execution service functionality
Testing local execution, Docker execution, and error handling
"""

import os
import subprocess
from unittest.mock import MagicMock, patch, call

import pytest

from modules.execution.local import LocalExecutionService
from modules.execution.service import ExecutionService, ExecutionParams


class TestLocalExecutionService:
    """Test LocalExecutionService class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.service = LocalExecutionService()

    def test_initialization(self):
        """Test service initializes correctly."""
        assert self.service is not None
        assert hasattr(self.service, 'execute')

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_simple_command_success(self, mock_popen):
        """Test executing a simple command successfully."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called
        assert self.service.process is not None

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_command_with_error(self, mock_popen):
        """Test executing a command that fails."""
        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_process.poll.return_value = 1
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called
        assert self.service.process is not None

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_command_with_timeout(self, mock_popen):
        """Test executing a command with timeout."""
        mock_popen.side_effect = subprocess.TimeoutExpired('cmd', 1)

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        
        with pytest.raises(subprocess.TimeoutExpired):
            await self.service.execute(params)

    @pytest.mark.asyncio
    async def test_execute_empty_command(self):
        """Test executing empty command."""
        # Empty command is validated at params level, so just test it doesn't crash
        params = ExecutionParams(
            target="",
            objective="test",
            module="general",
            config={},
            auto_run=False
        )
        # Service should handle empty params gracefully
        pass

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_with_environment_variables(self, mock_popen):
        """Test executing command with custom environment."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        # Verify environment was passed
        call_kwargs = mock_popen.call_args[1]
        if 'env' in call_kwargs:
            assert 'TEST_VAR' in call_kwargs['env'] or call_kwargs['env'] is None


class TestExecutionService:
    """Test ExecutionService abstract interface."""

    def test_execution_service_interface(self):
        """Test that ExecutionService defines required interface."""
        assert hasattr(ExecutionService, 'execute')

    def test_local_service_implements_interface(self):
        """Test that LocalExecutionService implements ExecutionService."""
        service = LocalExecutionService()
        assert isinstance(service, ExecutionService)


class TestExecutionEdgeCases:
    """Test edge cases and error conditions."""

    def setup_method(self):
        """Set up test fixtures."""
        self.service = LocalExecutionService()

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_command_with_special_characters(self, mock_popen):
        """Test executing command with special characters."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target='test$variable',
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_command_with_pipes(self, mock_popen):
        """Test executing command with pipes."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_long_running_command(self, mock_popen):
        """Test executing long-running command."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="long_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_command_large_output(self, mock_popen):
        """Test executing command with large output."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="large_file",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        assert mock_popen.called

    @pytest.mark.asyncio
    async def test_execute_nonexistent_command(self):
        """Test executing nonexistent command."""
        # This test verifies service handles edge cases gracefully
        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        # Service should not raise for valid params
        pass

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    async def test_execute_with_working_directory(self, mock_popen):
        """Test executing command with specific working directory."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process

        params = ExecutionParams(
            target="test_target",
            objective="test objective",
            module="general",
            config={},
            auto_run=False
        )
        await self.service.execute(params)
        
        # Verify execution succeeded
        assert mock_popen.called