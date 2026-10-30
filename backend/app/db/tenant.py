from typing import Any, Dict, Optional, List, Mapping
from bson.objectid import ObjectId

class TenantCollection:
    def __init__(self, collection: Any, user_id: str):
        self._collection = collection
        self.user_id = user_id

    def _inject_filter(self, filter_query: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        if filter_query is None:
            filter_query = {}
        else:
            filter_query = dict(filter_query)
        from app.core.context import get_current_user_role
        role = get_current_user_role()
        if role and str(role).upper() in ["ADMIN", "SUPERADMIN"]:
            return filter_query
        filter_query["user_id"] = self.user_id
        return filter_query

    def _inject_doc(self, document: Dict[str, Any]) -> Dict[str, Any]:
        doc = dict(document)
        doc["user_id"] = self.user_id
        return doc
        
    def _inject_pipeline(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        from app.core.context import get_current_user_role
        role = get_current_user_role()
        if role and str(role).upper() in ["ADMIN", "SUPERADMIN"]:
            return pipeline
        # Inject $match as the first stage
        if pipeline and "$match" in pipeline[0]:
            pipeline[0]["$match"]["user_id"] = self.user_id
        else:
            pipeline.insert(0, {"$match": {"user_id": self.user_id}})
        return pipeline

    def find(self, filter=None, *args, **kwargs):
        return self._collection.find(self._inject_filter(filter), *args, **kwargs)

    async def find_one(self, filter=None, *args, **kwargs):
        return await self._collection.find_one(self._inject_filter(filter), *args, **kwargs)

    async def insert_one(self, document, *args, **kwargs):
        return await self._collection.insert_one(self._inject_doc(document), *args, **kwargs)

    async def insert_many(self, documents, *args, **kwargs):
        docs = [self._inject_doc(doc) for doc in documents]
        return await self._collection.insert_many(docs, *args, **kwargs)

    async def update_one(self, filter, update, *args, **kwargs):
        return await self._collection.update_one(self._inject_filter(filter), update, *args, **kwargs)

    async def update_many(self, filter, update, *args, **kwargs):
        return await self._collection.update_many(self._inject_filter(filter), update, *args, **kwargs)

    async def delete_one(self, filter, *args, **kwargs):
        return await self._collection.delete_one(self._inject_filter(filter), *args, **kwargs)

    async def delete_many(self, filter, *args, **kwargs):
        return await self._collection.delete_many(self._inject_filter(filter), *args, **kwargs)

    async def count_documents(self, filter, *args, **kwargs):
        return await self._collection.count_documents(self._inject_filter(filter), *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        return self._collection.aggregate(self._inject_pipeline(pipeline), *args, **kwargs)

    async def find_one_and_update(self, filter, update, *args, **kwargs):
        return await self._collection.find_one_and_update(self._inject_filter(filter), update, *args, **kwargs)
        
    async def find_one_and_delete(self, filter, *args, **kwargs):
        return await self._collection.find_one_and_delete(self._inject_filter(filter), *args, **kwargs)
        
    async def distinct(self, key, filter=None, *args, **kwargs):
        return await self._collection.distinct(key, self._inject_filter(filter), *args, **kwargs)
        
    def __getattr__(self, name):
        # Fallback for any other methods
        return getattr(self._collection, name)

class TenantDatabase:
    def __init__(self, db: Any, user_id: str):
        self._db = db
        self.user_id = str(user_id)

    def __getitem__(self, name: str) -> Any:
        # Ignore tenant injection for specific collections
        if name in ["users", "roles"]:
            return self._db[name]
        return TenantCollection(self._db[name], self.user_id)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._db, name)
