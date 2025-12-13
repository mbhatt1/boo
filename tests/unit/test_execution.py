"""Unit tests for execution services."""

import pytest
from modules.execution.service import ExecutionParams, ExecutionMode
from modules.execution.local import LocalExecutionService


class TestExecutionParams:
    """Test execution parameter dataclass."""
    
    def test_create_params(self):
        """Test creating execution parameters."""
        params = ExecutionParams(
            target='http://example.com',
            objective='test objective',
            module='security',
            config={'key': 'value'},
            auto_run=True
        )
        
        assert params.target == 'http://example.com'
        assert params.objective == 'test objective'
        assert params.module == 'security'
        assert params.config == {'key': 'value'}
        assert params.auto_run is True
    
    def test_create_params_without_auto_run(self):
        """Test creating execution parameters without auto_run."""
        params = ExecutionParams(
            target='http://example.com',
            objective='test objective',
            module='security',
            config={}
        )
        
        assert params.auto_run is False


class TestLocalExecutionService:
    """Test local execution service."""
    
    def test_initialization(self):
        """Test service initializes correctly."""
        service = LocalExecutionService()
        
        assert service.process is None
        assert not service.is_active()
    
    @pytest.mark.asyncio
    async def test_stop_without_process(self):
        """Test stop works when no process is running."""
        service = LocalExecutionService()
        
        # Should not raise error
        await service.stop()
        assert not service.is_active()
    
    def test_is_active_without_process(self):
        """Test is_active returns False when no process exists."""
        service = LocalExecutionService()
        
        assert not service.is_active()