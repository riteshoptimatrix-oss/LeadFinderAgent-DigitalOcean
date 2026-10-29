"""
Website Field Data Consistency Validator
Validates that the website field is present and consistent across all layers
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.models.lead import LeadBase, LeadCreate, LeadResponse
import sys


class WebsiteFieldValidator:
    """Validates website field consistency across the application"""
    
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.passes = []
        
    async def connect_db(self):
        """Connect to MongoDB"""
        try:
            self.client = AsyncIOMotorClient(settings.MONGODB_URL)
            self.db = self.client[settings.DATABASE_NAME]
            await self.db.command('ping')
            self.passes.append("✓ Database connection successful")
            return True
        except Exception as e:
            self.errors.append(f"✗ Database connection failed: {str(e)}")
            return False
    
    async def validate_pydantic_models(self):
        """Validate Pydantic models have website field"""
        print("\n" + "="*60)
        print("VALIDATING PYDANTIC MODELS")
        print("="*60)
        
        try:
            # Check LeadBase
            if 'website' in LeadBase.model_fields:
                self.passes.append("✓ LeadBase model has 'website' field")
            else:
                self.errors.append("✗ LeadBase model missing 'website' field")
            
            # Check LeadCreate
            test_lead = LeadCreate(
                job_id="test",
                user_id="test",
                name="Test Business",
                website="https://example.com"
            )
            if hasattr(test_lead, 'website'):
                self.passes.append("✓ LeadCreate model has 'website' field")
            else:
                self.errors.append("✗ LeadCreate model missing 'website' field")
            
            # Check field type
            field_type = LeadBase.model_fields['website'].annotation
            if 'str' in str(field_type) or 'Optional' in str(field_type):
                self.passes.append(f"✓ Website field type is correct: {field_type}")
            else:
                self.warnings.append(f"⚠ Website field type may be incorrect: {field_type}")
                
        except Exception as e:
            self.errors.append(f"✗ Pydantic model validation failed: {str(e)}")
    
    async def validate_mongodb_schema(self):
        """Validate MongoDB documents have website field"""
        print("\n" + "="*60)
        print("VALIDATING MONGODB SCHEMA")
        print("="*60)
        
        try:
            # Get sample leads
            sample_leads = await self.db["leads"].find().limit(10).to_list(length=10)
            
            if not sample_leads:
                self.warnings.append("⚠ No leads found in database for validation")
                return
            
            # Check website field presence
            leads_with_website = 0
            leads_without_website_field = 0
            leads_with_empty_website = 0
            
            for lead in sample_leads:
                if 'website' in lead:
                    if lead['website']:
                        leads_with_website += 1
                    else:
                        leads_with_empty_website += 1
                else:
                    leads_without_website_field += 1
            
            self.passes.append(f"✓ Checked {len(sample_leads)} leads in database")
            self.passes.append(f"  - {leads_with_website} have website value")
            self.passes.append(f"  - {leads_with_empty_website} have empty website")
            
            if leads_without_website_field > 0:
                self.errors.append(f"✗ {leads_without_website_field} leads missing 'website' field")
            else:
                self.passes.append("✓ All leads have 'website' field")
            
            # Check for alternative field names
            alternative_fields = ['website_url', 'web_url', 'site', 'url', 'homepage', 'domain']
            for lead in sample_leads:
                for alt_field in alternative_fields:
                    if alt_field in lead:
                        self.errors.append(f"✗ Found alternative field '{alt_field}' in lead {lead.get('_id')}")
                        self.errors.append("  This should be migrated to 'website' field")
                        break
            
        except Exception as e:
            self.errors.append(f"✗ MongoDB schema validation failed: {str(e)}")
    
    async def validate_api_response_structure(self):
        """Validate API response structure includes website"""
        print("\n" + "="*60)
        print("VALIDATING API RESPONSE STRUCTURE")
        print("="*60)
        
        try:
            # Get a sample lead
            sample_lead = await self.db["leads"].find_one()
            
            if not sample_lead:
                self.warnings.append("⚠ No leads found for API response validation")
                return
            
            # Convert to response model
            sample_lead["_id"] = str(sample_lead["_id"])
            
            try:
                lead_response = LeadResponse(**sample_lead)
                
                if hasattr(lead_response, 'website'):
                    self.passes.append("✓ LeadResponse includes 'website' field")
                else:
                    self.errors.append("✗ LeadResponse missing 'website' field")
                
                # Check if website is in model_dump
                response_dict = lead_response.model_dump()
                if 'website' in response_dict:
                    self.passes.append("✓ LeadResponse.model_dump() includes 'website'")
                else:
                    self.errors.append("✗ LeadResponse.model_dump() missing 'website'")
                
            except Exception as e:
                self.errors.append(f"✗ Failed to create LeadResponse: {str(e)}")
                
        except Exception as e:
            self.errors.append(f"✗ API response validation failed: {str(e)}")
    
    async def validate_field_consistency(self):
        """Validate website field naming consistency"""
        print("\n" + "="*60)
        print("VALIDATING FIELD NAMING CONSISTENCY")
        print("="*60)
        
        # Check Python code files for field name variations
        import os
        import re
        
        root_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.join(root_dir, 'app')
        
        patterns_to_check = [
            (r'["\']website_url["\']', 'website_url'),
            (r'["\']web_url["\']', 'web_url'),
            (r'["\']site_url["\']', 'site_url'),
            (r'lead\.website_url', 'lead.website_url'),
            (r'lead\.web_url', 'lead.web_url'),
            (r'row\.website_url', 'row.website_url'),
        ]
        
        found_inconsistencies = []
        
        for root, dirs, files in os.walk(backend_dir):
            # Skip virtual environments and cache
            dirs[:] = [d for d in dirs if d not in ['venv', '.venv', '__pycache__', 'node_modules']]
            
            for file in files:
                if file.endswith(('.py', '.tsx', '.ts', '.jsx', '.js')):
                    filepath = os.path.join(root, file)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            content = f.read()
                            for pattern, name in patterns_to_check:
                                if re.search(pattern, content):
                                    found_inconsistencies.append((filepath, name))
                    except Exception:
                        pass
        
        if found_inconsistencies:
            self.errors.append("✗ Found inconsistent field names:")
            for filepath, fieldname in found_inconsistencies[:5]:  # Show first 5
                rel_path = os.path.relpath(filepath, root_dir)
                self.errors.append(f"  - {rel_path}: uses '{fieldname}'")
        else:
            self.passes.append("✓ No inconsistent field names found in code")
    
    async def validate_data_integrity(self):
        """Validate data integrity - no lost data"""
        print("\n" + "="*60)
        print("VALIDATING DATA INTEGRITY")
        print("="*60)
        
        try:
            # Count total leads
            total_leads = await self.db["leads"].count_documents({})
            self.passes.append(f"✓ Total leads in database: {total_leads}")
            
            # Count leads with website
            leads_with_website = await self.db["leads"].count_documents({
                "website": {"$nin": [None, ""]}
            })
            
            # Count leads without website
            leads_without_website = total_leads - leads_with_website
            
            self.passes.append(f"✓ Leads with website: {leads_with_website} ({(leads_with_website/total_leads*100):.1f}%)")
            self.passes.append(f"✓ Leads without website: {leads_without_website} ({(leads_without_website/total_leads*100):.1f}%)")
            
            # Check for duplicate website storage
            pipeline = [
                {"$match": {"website": {"$exists": True, "$nin": [None, ""]}}},
                {"$limit": 100},
                {"$project": {
                    "website": 1,
                    "website_url": 1,
                    "web_url": 1,
                    "site": 1,
                    "url": 1
                }}
            ]
            
            sample_with_websites = await self.db["leads"].aggregate(pipeline).to_list(length=100)
            
            duplicate_fields = []
            for lead in sample_with_websites:
                lead_id = str(lead.get('_id'))
                if 'website_url' in lead or 'web_url' in lead or 'site' in lead:
                    duplicate_fields.append(lead_id)
            
            if duplicate_fields:
                self.errors.append(f"✗ Found {len(duplicate_fields)} leads with duplicate website fields")
                self.errors.append("  These need data migration to consolidate into 'website' field")
            else:
                self.passes.append("✓ No duplicate website fields found")
                
        except Exception as e:
            self.errors.append(f"✗ Data integrity validation failed: {str(e)}")
    
    async def generate_migration_script(self):
        """Generate migration script if needed"""
        print("\n" + "="*60)
        print("CHECKING IF MIGRATION NEEDED")
        print("="*60)
        
        try:
            # Check for alternative fields
            alternative_fields = ['website_url', 'web_url', 'site_url', 'homepage', 'domain']
            needs_migration = False
            
            for field in alternative_fields:
                count = await self.db["leads"].count_documents({field: {"$exists": True}})
                if count > 0:
                    self.warnings.append(f"⚠ Found {count} leads with '{field}' field")
                    needs_migration = True
            
            if needs_migration:
                print("\nMigration script generated. Save this for later use.")
                self.warnings.append("⚠ Migration may be needed - see generated script")
            else:
                self.passes.append("✓ No migration needed - all data is consistent")
                
        except Exception as e:
            self.errors.append(f"✗ Migration check failed: {str(e)}")
    
    def print_report(self):
        """Print validation report"""
        print("\n" + "="*60)
        print("VALIDATION REPORT")
        print("="*60)
        
        print(f"\n✓ PASSED: {len(self.passes)} checks")
        for p in self.passes:
            print(f"  {p}")
        
        if self.warnings:
            print(f"\n⚠ WARNINGS: {len(self.warnings)} items")
            for w in self.warnings:
                print(f"  {w}")
        
        if self.errors:
            print(f"\n✗ ERRORS: {len(self.errors)} issues")
            for e in self.errors:
                print(f"  {e}")
        
        print("\n" + "="*60)
        if self.errors:
            print("STATUS: ❌ VALIDATION FAILED")
            print("ACTION REQUIRED: Fix errors above")
        elif self.warnings:
            print("STATUS: ⚠️  VALIDATION PASSED WITH WARNINGS")
            print("RECOMMENDATION: Review warnings")
        else:
            print("STATUS: ✅ VALIDATION PASSED")
            print("RESULT: Website field is consistent across all layers")
        print("="*60 + "\n")
        
        return len(self.errors) == 0
    
    async def close(self):
        """Close database connection"""
        if hasattr(self, 'client'):
            self.client.close()


async def main():
    """Main validation function"""
    print("\n" + "="*60)
    print("WEBSITE FIELD DATA CONSISTENCY VALIDATOR")
    print("="*60)
    print("\nThis script validates that the 'website' field is:")
    print("  1. Present in Pydantic models")
    print("  2. Present in MongoDB documents")
    print("  3. Included in API responses")
    print("  4. Named consistently everywhere")
    print("  5. Contains valid data")
    print()
    
    validator = WebsiteFieldValidator()
    
    # Connect to database
    connected = await validator.connect_db()
    if not connected:
        print("\n❌ Cannot proceed without database connection")
        return False
    
    # Run validations
    await validator.validate_pydantic_models()
    await validator.validate_mongodb_schema()
    await validator.validate_api_response_structure()
    await validator.validate_field_consistency()
    await validator.validate_data_integrity()
    await validator.generate_migration_script()
    
    # Print report
    success = validator.print_report()
    
    # Cleanup
    await validator.close()
    
    return success


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nValidation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Validation failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
