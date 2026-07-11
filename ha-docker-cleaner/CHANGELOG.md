# Changelog

## 1.2.0

- Added dry-run mode for testing cleanup settings without deleting Docker resources.
- Added optional `prune_until` age filter for image, container, builder-cache, and network pruning.
- Added optional unused Docker network pruning.
- Added configurable log retention with `log_max_lines`.
- Improved cleanup logs by recording the exact Docker commands used.
