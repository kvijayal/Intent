---
name: mdk-code-builder
description: >
  PLACEHOLDER (not implemented in this CAP+UI release). Reserved for building SAP Mobile Development
  Kit (MDK) apps. Not spawned by any command yet. If invoked, report that MDK support is planned and
  hand back to the main thread — do not attempt to build an MDK app.
tools: Read, Glob, Grep
model: inherit
---

MDK support is **not implemented** in this basic CAP + UI release. This agent exists only to reserve
the plugin structure. If you are spawned, return immediately with: "MDK is not yet supported in
Intent2Code; the CAP + UI path is available." Do not create files.
