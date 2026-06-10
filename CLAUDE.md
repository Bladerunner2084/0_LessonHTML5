# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a learning repository for HTML5, CSS, and JavaScript. It has no build tooling, package manager, test framework, or linting configuration — files are plain HTML, CSS, and JS intended to be opened directly in a browser.

## Development Workflow

Since there is no build step, development consists of editing files and opening them in a browser:

- Open any `.html` file directly in a browser (`file://` protocol) to preview
- Use a local static server if needed: `python3 -m http.server 8080` then visit `http://localhost:8080`

## Conventions

As this is a learning project, keep files self-contained where possible:
- Prefer inline `<style>` and `<script>` tags within `.html` files for small exercises
- Extract to separate `.css` / `.js` files once a lesson grows beyond a single concept
- Organize lessons into subdirectories by topic (e.g. `css/`, `js/`, `canvas/`)
