import uuid


def new_cuid_like() -> str:
    """Opaque id compatible with Prisma cuid length (not a real cuid)."""
    return f"qi_{uuid.uuid4().hex[:24]}"
