"""Tests for Mathison SDK"""

import pytest
from mathison_sdk import MathisonClient, AsyncMathisonClient
from mathison_sdk.models import HealthResponse


class TestMathisonClient:
    """Test synchronous client."""

    def test_client_initialization(self):
        client = MathisonClient(base_url="http://localhost:3000")
        assert client.base_url == "http://localhost:3000"
        client.close()

    def test_client_context_manager(self):
        with MathisonClient() as client:
            assert client is not None


class TestAsyncMathisonClient:
    """Test async client."""

    @pytest.mark.asyncio
    async def test_async_client_initialization(self):
        async with AsyncMathisonClient(base_url="http://localhost:3000") as client:
            assert client is not None
