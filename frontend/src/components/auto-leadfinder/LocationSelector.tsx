'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Country, State, City } from 'country-state-city';
import {
  Globe,
  Building2,
  MapPin,
  Check,
  Plus,
  Trash2,
  Compass,
  ChevronDown,
  Search,
  X,
  Sliders,
  Sparkles,
  Info
} from 'lucide-react';

export function getUnicodeFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌐';
  }
}

interface OptionItem {
  label: string;
  value: string;
  code?: string;
  icon?: string;
}

interface SearchableDropdownProps {
  label: string;
  icon: React.ReactNode;
  options: OptionItem[];
  value: string;
  placeholder: string;
  disabled?: boolean;
  onSelect: (val: string, item?: OptionItem) => void;
}

function SearchableDropdown({
  label,
  icon,
  options,
  value,
  placeholder,
  disabled = false,
  onSelect,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [options, search]);

  const displayed = useMemo(() => filtered.slice(0, 80), [filtered]);

  const selectedItem = useMemo(() => {
    return options.find((opt) => opt.value === value || opt.label === value);
  }, [options, value]);

  return (
    <div className="space-y-1.5 relative w-full" ref={containerRef}>
      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
      </label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen);
              setSearch('');
            }
          }}
          className={`w-full px-3.5 py-2.5 bg-white border rounded-xl shadow-2xs text-left flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
            disabled
              ? 'opacity-50 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-400'
              : isOpen
              ? 'border-teal-500 ring-2 ring-teal-500/20 text-slate-900'
              : 'border-slate-200/90 hover:border-slate-300 text-slate-800'
          }`}
        >
          <span className="truncate flex items-center gap-2">
            {selectedItem ? (
              <>
                {selectedItem.icon && <span className="text-base shrink-0">{selectedItem.icon}</span>}
                <span className="truncate">{selectedItem.label}</span>
              </>
            ) : (
              <span className="text-slate-400 font-normal">{placeholder}</span>
            )}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-100">
            <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              <input
                type="text"
                autoFocus
                placeholder={`Search ${label}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent border-0 py-1 text-xs outline-hidden text-slate-900 placeholder:text-slate-400 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <ul className="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50">
              {displayed.length > 0 ? (
                displayed.map((opt) => {
                  const isSelected = opt.value === value || opt.label === value;
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(opt.value, opt);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50 text-teal-800 font-bold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {opt.icon && <span className="text-base shrink-0">{opt.icon}</span>}
                          <span className="truncate">{opt.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-4 text-xs text-slate-400 text-center">
                  No matching {label.toLowerCase()} found
                </li>
              )}
            </ul>

            {filtered.length > 80 && (
              <div className="px-3 py-1.5 bg-slate-50 text-[10px] text-slate-400 border-t border-slate-100 text-center font-medium">
                Showing top 80 of {filtered.length} matches. Type to refine.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export interface TargetCityItem {
  country: string;
  country_code: string;
  state: string;
  state_code: string;
  city: string;
}

interface LocationSelectorProps {
  country: string;
  countryCode: string;
  state: string;
  stateCode: string;
  city: string;
  locationMode: 'kutch_systematic' | 'custom_city';
  targetCities: TargetCityItem[];
  discoveredPincodes?: string[];
  discoveredAreasCount?: number;
  isDiscovering?: boolean;
  onTriggerDiscovery?: (forceRefresh?: boolean) => void;
  onChangeLocation: (updated: {
    country: string;
    country_code: string;
    state: string;
    state_code: string;
    city: string;
    location_mode: 'kutch_systematic' | 'custom_city';
    target_cities?: TargetCityItem[];
  }) => void;
}

export default function LocationSelector({
  country,
  countryCode,
  state,
  stateCode,
  city,
  locationMode,
  targetCities,
  discoveredPincodes = [],
  discoveredAreasCount = 0,
  isDiscovering = false,
  onTriggerDiscovery,
  onChangeLocation,
}: LocationSelectorProps) {
  // Cascading options state
  const [countries, setCountries] = useState<OptionItem[]>([]);
  const [states, setStates] = useState<OptionItem[]>([]);
  const [cities, setCities] = useState<OptionItem[]>([]);
  const [customCityInput, setCustomCityInput] = useState<string>('');
  const [showCustomCityField, setShowCustomCityField] = useState<boolean>(false);

  // Load all countries once on mount
  useEffect(() => {
    const rawCountries = Country.getAllCountries();
    const formatted: OptionItem[] = rawCountries.map((c) => ({
      label: c.name,
      value: c.isoCode,
      code: c.isoCode,
      icon: getUnicodeFlag(c.isoCode),
    }));
    setCountries(formatted);
  }, []);

  // Update states whenever selected country changes
  useEffect(() => {
    const code = countryCode || 'IN';
    const rawStates = State.getStatesOfCountry(code);
    const formatted: OptionItem[] = rawStates.map((s) => ({
      label: s.name,
      value: s.isoCode,
      code: s.isoCode,
    }));
    setStates(formatted);
  }, [countryCode]);

  // Update cities whenever selected country or state changes
  useEffect(() => {
    const cCode = countryCode || 'IN';
    const sCode = stateCode || 'GJ';
    if (!cCode || !sCode) {
      setCities([]);
      return;
    }
    const rawCities = City.getCitiesOfState(cCode, sCode);
    const formatted: OptionItem[] = rawCities.map((c) => ({
      label: c.name,
      value: c.name,
      code: c.stateCode,
    }));
    setCities(formatted);
  }, [countryCode, stateCode]);

  // Handle Country selection
  const handleSelectCountry = (cCode: string, item?: OptionItem) => {
    const countryName = item?.label || cCode;
    onChangeLocation({
      country: countryName,
      country_code: cCode,
      state: '',
      state_code: '',
      city: '',
      location_mode: 'custom_city',
    });
    setShowCustomCityField(false);
  };

  // Handle State selection
  const handleSelectState = (sCode: string, item?: OptionItem) => {
    const stateName = item?.label || sCode;
    onChangeLocation({
      country,
      country_code: countryCode,
      state: stateName,
      state_code: sCode,
      city: '',
      location_mode: 'custom_city',
    });
    setShowCustomCityField(false);
  };

  // Handle City selection
  const handleSelectCity = (cityName: string) => {
    onChangeLocation({
      country,
      country_code: countryCode,
      state,
      state_code: stateCode,
      city: cityName,
      location_mode: cityName.toLowerCase().includes('kutch') ? 'kutch_systematic' : 'custom_city',
    });
  };

  // Handle Custom City manual submit
  const handleAddCustomCity = () => {
    if (!customCityInput.trim()) return;
    const trimmed = customCityInput.trim();
    onChangeLocation({
      country,
      country_code: countryCode,
      state,
      state_code: stateCode,
      city: trimmed,
      location_mode: trimmed.toLowerCase().includes('kutch') ? 'kutch_systematic' : 'custom_city',
    });
    setCustomCityInput('');
    setShowCustomCityField(false);
  };

  // Switch to Default Kutch Priority
  const handleSwitchToKutchPriority = () => {
    onChangeLocation({
      country: 'India',
      country_code: 'IN',
      state: 'Gujarat',
      state_code: 'GJ',
      city: 'Kutch district',
      location_mode: 'kutch_systematic',
    });
  };

  // Add current city to saved target cities list
  const handleSaveToTargetCities = () => {
    if (!city) return;
    const exists = targetCities.some(
      (tc) =>
        tc.city.toLowerCase() === city.toLowerCase() &&
        tc.state.toLowerCase() === state.toLowerCase()
    );
    if (exists) return;

    const newTargetCities = [
      ...targetCities,
      {
        country: country || 'India',
        country_code: countryCode || 'IN',
        state: state || 'Gujarat',
        state_code: stateCode || 'GJ',
        city,
      },
    ];

    onChangeLocation({
      country,
      country_code: countryCode,
      state,
      state_code: stateCode,
      city,
      location_mode: locationMode,
      target_cities: newTargetCities,
    });
  };

  // Remove a city from target cities list
  const handleRemoveTargetCity = (indexToRemove: number) => {
    const updated = targetCities.filter((_, idx) => idx !== indexToRemove);
    onChangeLocation({
      country,
      country_code: countryCode,
      state,
      state_code: stateCode,
      city,
      location_mode: locationMode,
      target_cities: updated,
    });
  };

  // Activate a saved target city
  const handleActivateCity = (item: TargetCityItem) => {
    const isKutch = item.city.toLowerCase().includes('kutch');
    onChangeLocation({
      country: item.country,
      country_code: item.country_code,
      state: item.state,
      state_code: item.state_code,
      city: item.city,
      location_mode: isKutch ? 'kutch_systematic' : 'custom_city',
    });
  };

  const isKutchMode = locationMode === 'kutch_systematic' || city.toLowerCase().includes('kutch');

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Target Scraping Location Selection</h3>
            <p className="text-xs text-slate-500">
              Select your target geography via cascading Country → State → City dropdowns.
            </p>
          </div>
        </div>

        {/* Mode Selector Pill Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/80 self-start sm:self-center">
          <button
            type="button"
            onClick={handleSwitchToKutchPriority}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isKutchMode
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Kutch Priority (Sequential)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isKutchMode) {
                onChangeLocation({
                  country: country || 'India',
                  country_code: countryCode || 'IN',
                  state: state || 'Gujarat',
                  state_code: stateCode || 'GJ',
                  city: city || 'Ahmedabad',
                  location_mode: 'custom_city',
                });
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              !isKutchMode
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-teal-400" />
            <span>Custom City Selection</span>
          </button>
        </div>
      </div>

      {/* Active Target Banner with Discovered Postal Areas */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-50/70 to-slate-50 border border-teal-200/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs text-lg shrink-0 mt-0.5">
            {getUnicodeFlag(countryCode || 'IN')}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Active Scraping Location:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800">
                {isKutchMode ? 'KUTCH PRIORITY ENGINE' : 'MANUAL CITY SELECTION'}
              </span>
              {discoveredAreasCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>{discoveredAreasCount} Postal Areas Discovered</span>
                </span>
              )}
            </div>
            <p className="text-sm font-extrabold text-teal-950 mt-0.5">
              {city || 'Kutch district'}, {state || 'Gujarat'}, {country || 'India'}
            </p>

            {/* Discovered PIN Codes Badges */}
            {discoveredPincodes && discoveredPincodes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] font-semibold text-slate-500">Discovered PIN Codes:</span>
                {discoveredPincodes.map((pin) => (
                  <span
                    key={pin}
                    className="px-2 py-0.5 bg-white border border-teal-200 text-teal-800 rounded-md text-[10px] font-bold shadow-2xs"
                  >
                    📮 {pin}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
          {onTriggerDiscovery && (
            <button
              type="button"
              disabled={isDiscovering || !city}
              onClick={() => onTriggerDiscovery(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer"
              title="Automatically discover all PIN codes and postal areas for this city"
            >
              <Search className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
              <span>{isDiscovering ? 'Discovering Postal Areas...' : 'Auto-Discover Areas (PIN Code API)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveToTargetCities}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-teal-50 border border-teal-300 text-teal-800 shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save to Target Cities</span>
          </button>
        </div>
      </div>

      {/* Cascading Dropdowns: Country → State → City */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Country Dropdown */}
        <SearchableDropdown
          label="Country"
          icon={<Globe className="w-3.5 h-3.5 text-teal-600" />}
          options={countries}
          value={countryCode}
          placeholder="Select Country..."
          onSelect={(cCode, item) => handleSelectCountry(cCode, item)}
        />

        {/* 2. State Dropdown */}
        <SearchableDropdown
          label="State / Province"
          icon={<Building2 className="w-3.5 h-3.5 text-teal-600" />}
          options={states}
          value={stateCode}
          placeholder={countryCode ? 'Select State...' : 'Select Country first'}
          disabled={!countryCode}
          onSelect={(sCode, item) => handleSelectState(sCode, item)}
        />

        {/* 3. City Dropdown */}
        <div className="space-y-1.5">
          <SearchableDropdown
            label="City"
            icon={<MapPin className="w-3.5 h-3.5 text-teal-600" />}
            options={cities}
            value={city}
            placeholder={stateCode ? 'Select City...' : 'Select State first'}
            disabled={!stateCode}
            onSelect={(cityName) => handleSelectCity(cityName)}
          />

          {/* Fallback to custom city name entry */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={!stateCode}
              onClick={() => setShowCustomCityField(!showCustomCityField)}
              className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 transition-colors cursor-pointer disabled:opacity-40"
            >
              {showCustomCityField ? '✕ Cancel custom city' : '+ Enter custom town / city name'}
            </button>
          </div>

          {showCustomCityField && (
            <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-150">
              <input
                type="text"
                placeholder="Type city or town name..."
                value={customCityInput}
                onChange={(e) => setCustomCityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCity();
                  }
                }}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              <button
                type="button"
                onClick={handleAddCustomCity}
                disabled={!customCityInput.trim()}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
              >
                Set
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Saved Target Cities Quick Switcher */}
      {targetCities && targetCities.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-teal-600" />
              <span>Configured Target Cities ({targetCities.length}):</span>
            </span>
            <span className="text-[11px] text-slate-400">Click any city to switch active scraping target</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {targetCities.map((tc, index) => {
              const isActiveCity =
                tc.city.toLowerCase() === city.toLowerCase() &&
                tc.state.toLowerCase() === state.toLowerCase();

              return (
                <div
                  key={`${tc.city}-${tc.state}-${index}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all ${
                    isActiveCity
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleActivateCity(tc)}
                    className="flex items-center gap-1.5 font-bold cursor-pointer"
                  >
                    <span>{getUnicodeFlag(tc.country_code)}</span>
                    <span>{tc.city}</span>
                    <span className={`text-[10px] font-normal ${isActiveCity ? 'text-teal-100' : 'text-slate-400'}`}>
                      ({tc.state})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveTargetCity(index)}
                    className={`p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer ${
                      isActiveCity ? 'text-white' : 'text-slate-400 hover:text-rose-600'
                    }`}
                    title="Remove from target cities"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-600 text-[11px] leading-relaxed">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div>
          When <strong className="text-slate-800">Kutch Priority</strong> is active, the engine explores all 44 Kutch localities sequentially until reaching your 100 daily unique lead target. When a <strong className="text-slate-800">Custom City</strong> is selected (e.g. Ahmedabad, Jaipur, Udaipur), leads are collected specifically within that chosen urban area and assigned to <span className="font-semibold text-slate-800">kutchtourguide@gmail.com</span>.
        </div>
      </div>
    </div>
  );
}
