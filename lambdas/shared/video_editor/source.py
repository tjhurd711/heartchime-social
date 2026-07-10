from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List


class Source(ABC):
    @abstractmethod
    def fetch(self, query: str, limit: int) -> List[Path]:
        ...


class LocalFiles(Source):
    def __init__(self, paths: List[Path]):
        self.paths = [Path(p) for p in paths]

    def fetch(self, query: str, limit: int) -> List[Path]:
        del query
        return [p for p in self.paths if p.is_file()][:limit]


class S3KeysSource(Source):
    """Download S3 keys to a temp directory and return local paths."""

    def __init__(self, keys: List[str], *, bucket: str, work_dir: str, s3_client):
        self.keys = keys
        self.bucket = bucket
        self.work_dir = work_dir
        self.s3_client = s3_client

    def fetch(self, query: str, limit: int) -> List[Path]:
        del query
        paths: List[Path] = []
        for index, key in enumerate(self.keys[:limit]):
            safe_name = key.replace("/", "_")
            local = Path(self.work_dir) / f"source_{index:03d}_{safe_name}"
            if not str(local).endswith(".mp4"):
                local = local.with_suffix(".mp4")
            self.s3_client.download_file(self.bucket, key, str(local))
            paths.append(local)
        return paths
