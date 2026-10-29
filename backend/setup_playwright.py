#!/usr/bin/env python3
"""
Script to install Playwright browsers and fix browser-related issues.
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and return True if successful."""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {description} completed successfully")
            if result.stdout.strip():
                print(f"   Output: {result.stdout.strip()}")
            return True
        else:
            print(f"❌ {description} failed")
            if result.stderr.strip():
                print(f"   Error: {result.stderr.strip()}")
            return False
    except Exception as e:
        print(f"❌ {description} failed with exception: {e}")
        return False

def main():
    """Install Playwright browsers and dependencies."""
    print("🎭 Setting up Playwright...")
    print("=" * 40)
    
    # Check if playwright is installed
    print("🔍 Checking Playwright installation...")
    try:
        import playwright
        print(f"✅ Playwright is installed (version: {playwright.__version__})")
    except ImportError:
        print("❌ Playwright is not installed")
        print("   Please install it with: pip install playwright")
        return 1
    
    # Install browsers
    commands = [
        ("playwright install", "Installing Playwright browsers"),
        ("playwright install-deps", "Installing system dependencies"),
    ]
    
    success = True
    for cmd, desc in commands:
        if not run_command(cmd, desc):
            success = False
            # Continue with other commands even if one fails
    
    if success:
        print("\n🎉 Playwright setup completed successfully!")
        print("   The browser executable error should now be resolved.")
    else:
        print("\n⚠️  Some Playwright setup commands failed.")
        print("   You may need to run them manually:")
        print("   - playwright install")
        print("   - playwright install-deps")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())