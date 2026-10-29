#!/usr/bin/env python3
"""
Verification script for the schema field fix.
Ensures the SEOAnalysis model loads without warnings.
"""

import warnings
import sys

# Capture warnings
warnings.simplefilter("always")
warning_list = []

def warning_handler(message, category, filename, lineno, file=None, line=None):
    warning_list.append({
        "message": str(message),
        "category": category.__name__,
        "file": filename,
        "line": lineno
    })

# Set custom warning handler
warnings.showwarning = warning_handler

# Try importing the model
try:
    from app.models.lead import SEOAnalysis, LeadBase
    print("✓ Models imported successfully")
    
    # Check if SEOAnalysis has the correct field
    model_fields = SEOAnalysis.model_fields
    
    if 'schema_markup' in model_fields:
        print("✓ SEOAnalysis.schema_markup field exists in model_fields")
    else:
        print("✗ SEOAnalysis.schema_markup field NOT found in model_fields")
        sys.exit(1)
    
    # Check if old 'schema' field is gone
    if 'schema' in model_fields:
        print("✗ Old 'schema' field still exists!")
        sys.exit(1)
    else:
        print("✓ Old 'schema' field removed")
    
    if 'schema_markup' in model_fields:
        print("✓ Confirmed: 'schema_markup' field is present")
    else:
        print("✗ New 'schema_markup' field NOT in model_fields")
        sys.exit(1)
    
    # Check for shadowing warnings
    shadowing_warnings = [w for w in warning_list if 'shadows' in w['message'].lower()]
    
    if shadowing_warnings:
        print(f"\n✗ Found {len(shadowing_warnings)} shadowing warning(s):")
        for w in shadowing_warnings:
            print(f"  - {w['message']}")
        sys.exit(1)
    else:
        print("✓ No shadowing warnings detected")
    
    # Test instantiation
    try:
        test_seo = SEOAnalysis(
            seo_score=85,
            schema_markup=True,
            meta_description=True
        )
        print("✓ SEOAnalysis instantiation successful")
        print(f"  - schema_markup value: {test_seo.schema_markup}")
    except Exception as e:
        print(f"✗ Failed to instantiate SEOAnalysis: {e}")
        sys.exit(1)
    
    print("\n" + "="*60)
    print("✅ ALL CHECKS PASSED")
    print("="*60)
    print("\nThe schema field shadowing issue is FIXED!")
    print("You can now start the server without warnings.")
    
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)
except Exception as e:
    print(f"✗ Unexpected error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
