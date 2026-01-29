"""
Delivery Cost Calculator using OSRM API
Calculates delivery price based on real road distance
"""

import requests
import math
from typing import Dict, Optional

# Constants
BASE_RADIUS = 2.0  # km
BASE_PRICE = 5000  # base price for distances <= BASE_RADIUS
PRICE_PER_KM = 2000  # price per extra km beyond BASE_RADIUS


def get_road_distance(source_lat: float, source_lon: float, 
                      dest_lat: float, dest_lon: float) -> Optional[float]:
    """
    Get road distance between two points using OSRM API.
    
    Args:
        source_lat: Restaurant latitude
        source_lon: Restaurant longitude
        dest_lat: Client latitude
        dest_lon: Client longitude
    
    Returns:
        Distance in kilometers or None if API call fails
    """
    # OSRM uses lon,lat format (not lat,lon!)
    url = f"http://router.project-osrm.org/route/v1/driving/{source_lon},{source_lat};{dest_lon},{dest_lat}?overview=false"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get('code') != 'Ok':
            print(f"OSRM Error: {data.get('message', 'Unknown error')}")
            return None
        
        # Distance is in meters, convert to kilometers
        distance_meters = data['routes'][0]['distance']
        distance_km = distance_meters / 1000.0
        
        return round(distance_km, 2)
        
    except requests.RequestException as e:
        print(f"API Request Error: {e}")
        return None
    except (KeyError, IndexError) as e:
        print(f"Response Parsing Error: {e}")
        return None


def calculate_price(distance_km: float) -> int:
    """
    Calculate delivery price based on distance.
    
    Rules:
    - If distance <= BASE_RADIUS (2km): price = BASE_PRICE (5000)
    - If distance > BASE_RADIUS: 
        extra_km = distance - BASE_RADIUS (rounded UP to whole number)
        price = BASE_PRICE + (extra_km * PRICE_PER_KM)
    
    Args:
        distance_km: Distance in kilometers
    
    Returns:
        Delivery price in currency units
    """
    if distance_km <= BASE_RADIUS:
        return BASE_PRICE
    
    # Calculate extra distance beyond base radius
    extra_distance = distance_km - BASE_RADIUS
    
    # Round UP to the next whole number (ceiling)
    extra_km_rounded = math.ceil(extra_distance)
    
    # Calculate total price
    total_price = BASE_PRICE + (extra_km_rounded * PRICE_PER_KM)
    
    return total_price


def calculate_delivery_price(source_lat: float, source_lon: float,
                             dest_lat: float, dest_lon: float) -> Dict:
    """
    Calculate delivery price based on real road distance.
    
    Args:
        source_lat: Restaurant latitude
        source_lon: Restaurant longitude
        dest_lat: Client latitude
        dest_lon: Client longitude
    
    Returns:
        Dictionary with distance_km and price
    """
    distance_km = get_road_distance(source_lat, source_lon, dest_lat, dest_lon)
    
    if distance_km is None:
        return {
            "error": "Could not calculate distance",
            "distance_km": None,
            "price": None
        }
    
    price = calculate_price(distance_km)
    
    return {
        "distance_km": distance_km,
        "price": price
    }


def calculate_delivery_price_from_distance(distance_km: float) -> Dict:
    """
    Calculate delivery price from a known distance (for testing).
    
    Args:
        distance_km: Distance in kilometers
    
    Returns:
        Dictionary with distance_km and price
    """
    price = calculate_price(distance_km)
    
    return {
        "distance_km": distance_km,
        "price": price
    }


if __name__ == "__main__":
    print("=" * 50)
    print("Delivery Price Calculator - Test Cases")
    print("=" * 50)
    print(f"\nConstants:")
    print(f"  BASE_RADIUS = {BASE_RADIUS} km")
    print(f"  BASE_PRICE = {BASE_PRICE}")
    print(f"  PRICE_PER_KM = {PRICE_PER_KM}")
    print()
    
    # Test Case 1: 10 km distance
    # Extra = 10 - 2 = 8 km
    # Price = 5000 + (8 * 2000) = 5000 + 16000 = 21000
    print("Test Case 1: Distance = 10 km")
    result1 = calculate_delivery_price_from_distance(10.0)
    print(f"  Result: {result1}")
    print(f"  Expected: {{'distance_km': 10.0, 'price': 21000}}")
    print(f"  ✓ PASS" if result1['price'] == 21000 else f"  ✗ FAIL")
    print()
    
    # Test Case 2: 2.01 km distance
    # Extra = 2.01 - 2 = 0.01 km -> ceil(0.01) = 1 km
    # Price = 5000 + (1 * 2000) = 7000
    print("Test Case 2: Distance = 2.01 km")
    result2 = calculate_delivery_price_from_distance(2.01)
    print(f"  Result: {result2}")
    print(f"  Expected: {{'distance_km': 2.01, 'price': 7000}}")
    print(f"  ✓ PASS" if result2['price'] == 7000 else f"  ✗ FAIL")
    print()
    
    # Additional test cases
    print("Additional Test Cases:")
    print("-" * 50)
    
    # Test Case 3: Exactly 2 km (within base radius)
    result3 = calculate_delivery_price_from_distance(2.0)
    print(f"  2.0 km -> Price: {result3['price']} (Expected: 5000)")
    
    # Test Case 4: 1.5 km (within base radius)
    result4 = calculate_delivery_price_from_distance(1.5)
    print(f"  1.5 km -> Price: {result4['price']} (Expected: 5000)")
    
    # Test Case 5: 3.0 km
    # Extra = 3 - 2 = 1 km
    # Price = 5000 + 2000 = 7000
    result5 = calculate_delivery_price_from_distance(3.0)
    print(f"  3.0 km -> Price: {result5['price']} (Expected: 7000)")
    
    # Test Case 6: 4.5 km
    # Extra = 4.5 - 2 = 2.5 km -> ceil(2.5) = 3 km
    # Price = 5000 + (3 * 2000) = 11000
    result6 = calculate_delivery_price_from_distance(4.5)
    print(f"  4.5 km -> Price: {result6['price']} (Expected: 11000)")
    
    # Test Case 7: 5.1 km
    # Extra = 5.1 - 2 = 3.1 km -> ceil(3.1) = 4 km
    # Price = 5000 + (4 * 2000) = 13000
    result7 = calculate_delivery_price_from_distance(5.1)
    print(f"  5.1 km -> Price: {result7['price']} (Expected: 13000)")
    
    print()
    print("=" * 50)
    print("Real Distance Test (OSRM API)")
    print("=" * 50)
    
    # Real test with actual coordinates (Tashkent example)
    # Restaurant: Chorsu Bazaar
    source = (41.3275, 69.2297)
    # Client: Yunusabad
    dest = (41.3656, 69.2860)
    
    print(f"\nSource (Restaurant): {source}")
    print(f"Destination (Client): {dest}")
    
    result = calculate_delivery_price(source[0], source[1], dest[0], dest[1])
    print(f"\nResult: {result}")
