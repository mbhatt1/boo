"""Local execution service for running Boo agent as subprocess.

This is the default execution mode that runs the agent directly
on the local machine without Docker.
"""

import subprocess
import sys
from pathlib import Path
from typing import Optional

from .service import ExecutionService, ExecutionParams


class LocalExecutionService(ExecutionService):
    """Execute agent as local subprocess."""
    
    def __init__(self):
        """Initialize local execution service."""
        self.process: Optional[subprocess.Popen] = None
        self._is_active = False
    
    async def execute(self, params: ExecutionParams) -> None:
        """Execute agent locally via subprocess.
        
        Args:
            params: Execution parameters.
        """
        # Build command
        cmd = [
            sys.executable,  # Use current Python interpreter
            'src/boo.py',
            '--target', params.target,
            '--objective', params.objective,
            '--module', params.module
        ]
        
        if params.auto_run:
            cmd.append('--auto-run')
        
        # Start subprocess
        # Bug #42 fix: Cleanup on exception
        try:
            self._is_active = True
            # Bug #41 & #50 fix: Use DEVNULL to prevent pipe deadlock
            # Pipes were never read, causing deadlock when buffers fill (>64KB)
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True
            )
        except Exception:
            # Reset state if subprocess creation fails
            self._is_active = False
            self.process = None
            raise
    
    async def stop(self) -> None:
        """Stop the local execution."""
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
        self._is_active = False
    
    def is_active(self) -> bool:
        """Check if execution is active.
        
        Returns:
            True if process is running, False otherwise.
        """
        if self.process:
            return self.process.poll() is None
        return False