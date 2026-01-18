# @mathison/mesh

Scheduler and thread orchestration for Mathison v2.

## Purpose

WHY: Explicit scheduler with logged decisions makes thread selection auditable and debuggable.

Responsibilities:
- Select next runnable thread
- Log scheduler decisions

## WHY

**Why log scheduler decisions?**
Enables debugging (why was thread X selected?) and analysis (optimize scheduler over time).

**Why priority-based selection?**
Simple and predictable, can be enhanced later with more sophisticated algorithms.

See [Architecture](../../docs/ARCHITECTURE.md)
