"""JSON Exporter"""
import os
import json
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class JSONExporter:
    def __init__(self):
        self.reports_dir = "reports/json"
        os.makedirs(self.reports_dir, exist_ok=True)
    
    async def export(self, report_id: str, report_data: Dict[str, Any]) -> tuple[str, int]:
        filename = f"{report_id}_data.json"
        file_path = os.path.join(self.reports_dir, filename)
        
        # Clean data for JSON serialization
        clean_data = self._clean_for_json(report_data)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(clean_data, f, indent=2, ensure_ascii=False)
        
        file_size = os.path.getsize(file_path)
        return file_path, file_size
    
    def _clean_for_json(self, data: Any) -> Any:
        """Remove non-JSON-serializable objects"""
        if isinstance(data, dict):
            return {k: self._clean_for_json(v) for k, v in data.items() if k != '_id'}
        elif isinstance(data, list):
            return [self._clean_for_json(item) for item in data]
        elif hasattr(data, 'isoformat'):  # datetime objects
            return data.isoformat()
        else:
            return data
