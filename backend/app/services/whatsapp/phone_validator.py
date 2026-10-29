"""
Phone Number Validation and Formatting Service
Handles international phone number validation and E.164 formatting
"""
import re
from typing import Optional, Tuple


class PhoneValidator:
    """Validates and formats phone numbers for WhatsApp"""
    
    # Country code mapping for common formats
    COUNTRY_CODES = {
        "IN": "+91",    # India
        "US": "+1",     # United States
        "GB": "+44",    # United Kingdom
        "AE": "+971",   # UAE
        "SA": "+966",   # Saudi Arabia
        "AU": "+61",    # Australia
        "CA": "+1",     # Canada
        "SG": "+65",    # Singapore
        "MY": "+60",    # Malaysia
        "PK": "+92",    # Pakistan
        "BD": "+880",   # Bangladesh
        "LK": "+94",    # Sri Lanka
        "NP": "+977",   # Nepal
    }
    
    @staticmethod
    def normalize_phone(phone: str, default_country: str = "IN") -> Optional[str]:
        """
        Normalize phone number to E.164 format
        Returns: +<country_code><number> or None if invalid
        
        Examples:
            "9876543210" -> "+919876543210"
            "+91 98765 43210" -> "+919876543210"
            "91-9876543210" -> "+919876543210"
        """
        if not phone:
            return None
            
        # Remove all non-digit characters except +
        cleaned = re.sub(r'[^\d+]', '', phone.strip())
        
        if not cleaned:
            return None
        
        # Already has + at start
        if cleaned.startswith('+'):
            # Validate it has enough digits (min 10)
            if len(cleaned) >= 11:  # +<country><number>
                return cleaned
            return None
        
        # Has country code without +
        if len(cleaned) > 10:
            # Likely already has country code
            return f"+{cleaned}"
        
        # Add default country code
        country_code = PhoneValidator.COUNTRY_CODES.get(default_country, "+91")
        return f"{country_code}{cleaned}"
    
    @staticmethod
    def validate_phone(phone: str) -> Tuple[bool, str]:
        """
        Validate if phone number is valid for WhatsApp
        Returns: (is_valid, error_message)
        """
        if not phone:
            return False, "Phone number is empty"
        
        # Remove whitespace
        phone = phone.strip()
        
        # Check minimum length
        if len(phone) < 10:
            return False, "Phone number too short (minimum 10 digits)"
        
        # Check if it contains at least some digits
        if not re.search(r'\d', phone):
            return False, "Phone number contains no digits"
        
        # Extract digits only
        digits_only = re.sub(r'[^\d]', '', phone)
        
        # Check digit count (between 10-15 digits typical for international)
        if len(digits_only) < 10:
            return False, "Phone number has too few digits"
        if len(digits_only) > 15:
            return False, "Phone number has too many digits"
        
        return True, ""
    
    @staticmethod
    def format_for_display(phone: str) -> str:
        """
        Format phone for human-readable display
        +919876543210 -> +91 98765 43210
        """
        if not phone or not phone.startswith('+'):
            return phone
        
        # Extract country code and number
        if len(phone) > 3:
            country = phone[:3]  # e.g., +91
            number = phone[3:]
            
            # Format number in groups
            if len(number) == 10:
                # Format as XX XXX XXXXX
                return f"{country} {number[:2]} {number[2:5]} {number[5:]}"
            else:
                # Default grouping
                return f"{country} {number}"
        
        return phone
    
    @staticmethod
    def is_whatsapp_compatible(phone: str) -> bool:
        """
        Check if phone format is compatible with WhatsApp
        Must start with + and contain only digits after that
        """
        if not phone or not phone.startswith('+'):
            return False
        
        # After +, must be only digits
        number_part = phone[1:]
        return number_part.isdigit() and 10 <= len(number_part) <= 15
    
    @staticmethod
    def extract_country_code(phone: str) -> Optional[str]:
        """
        Extract country code from phone number
        +919876543210 -> +91
        """
        if not phone or not phone.startswith('+'):
            return None
        
        # Try to match known country codes
        for code in sorted(PhoneValidator.COUNTRY_CODES.values(), key=len, reverse=True):
            if phone.startswith(code):
                return code
        
        # Fallback: first 2-3 digits after +
        if len(phone) >= 3:
            return phone[:3]
        
        return None
