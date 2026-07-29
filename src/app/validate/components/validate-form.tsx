"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search } from "lucide-react";

/**
 * Validation schema for the form
 * Must match the API schema in src/lib/validation.ts
 */
const validateSchema = z.object({
  institutionName: z
    .string()
    .min(2, "Institution name must be at least 2 characters")
    .max(200, "Institution name must be less than 200 characters"),
  university: z.string().optional(),
  force: z.boolean().optional(),
});

type ValidateFormData = z.infer<typeof validateSchema>;

interface ValidateFormProps {
  onSubmit: (institutionName: string, forceRevalidate?: boolean) => void;
  isLoading: boolean;
}

export function ValidateForm({ onSubmit, isLoading }: ValidateFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ValidateFormData>({
    resolver: zodResolver(validateSchema),
    defaultValues: {
      institutionName: "",
      university: "",
      force: false,
    },
  });

  const institutionName = watch("institutionName");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch autocomplete suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (institutionName.length > 1) {
        try {
          const response = await fetch(
            `/api/institutions?q=${encodeURIComponent(institutionName)}`
          );
          if (response.ok) {
            const data = await response.json();
            setSuggestions(data.suggestions || []);
            setShowSuggestions(true);
          }
        } catch (error) {
          console.error("Failed to fetch suggestions:", error);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 200); // Debounce 200ms per spec

    return () => clearTimeout(timer);
  }, [institutionName]);

  const handleFormSubmit = (data: ValidateFormData) => {
    onSubmit(data.institutionName, data.force);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue("institutionName", suggestion);
    setShowSuggestions(false);
    onSubmit(suggestion, false);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="bg-bg-secondary border border-border rounded-lg p-6 space-y-4">
        {/* Institution Name Field */}
        <div className="space-y-2">
          <label
            htmlFor="institutionName"
            className="block text-sm font-medium text-text"
          >
            Institution Name *
          </label>
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary pointer-events-none"
            />
            <input
              id="institutionName"
              type="text"
              placeholder="e.g., Indian Institute of Technology Bombay"
              className={`
                w-full pl-12 pr-4 py-3 rounded-md
                bg-bg border-2 transition-colors
                text-text placeholder-text-secondary
                focus:outline-none focus:border-primary
                ${errors.institutionName ? "border-danger" : "border-border"}
              `}
              {...register("institutionName")}
              aria-invalid={!!errors.institutionName}
              aria-describedby={errors.institutionName ? "error-institutionName" : undefined}
            />

            {/* Autocomplete Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-md shadow-lg z-dropdown">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-2 hover:bg-bg-tertiary transition-colors text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          {errors.institutionName && (
            <p id="error-institutionName" className="text-sm text-danger">
              {errors.institutionName.message}
            </p>
          )}
        </div>

        {/* University Field (Optional) */}
        <div className="space-y-2">
          <label
            htmlFor="university"
            className="block text-sm font-medium text-text"
          >
            University / Parent Organization (Optional)
          </label>
          <input
            id="university"
            type="text"
            placeholder="e.g., Affiliating university or parent body"
            className={`
              w-full px-4 py-3 rounded-md
              bg-bg border-2 border-border transition-colors
              text-text placeholder-text-secondary
              focus:outline-none focus:border-primary
            `}
            {...register("university")}
          />
        </div>

        {/* Force Revalidation Checkbox */}
        <div className="flex items-center gap-2">
          <input
            id="force"
            type="checkbox"
            className="w-4 h-4 rounded cursor-pointer"
            {...register("force")}
          />
          <label htmlFor="force" className="text-sm text-text-secondary cursor-pointer">
            Force revalidation (skip cache)
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-md
            font-medium transition-all
            ${
              isLoading
                ? "bg-primary/50 text-white cursor-not-allowed"
                : "bg-primary text-white hover:opacity-90 active:opacity-75"
            }
            focus:outline-2 focus:outline-offset-2 focus:outline-primary
          `}
        >
          <Search size={18} />
          {isLoading ? "Validating..." : "Validate"}
        </button>

        {/* Recent Searches */}
        <RecentSearches onSelect={handleSuggestionClick} />
      </div>
    </form>
  );
}

/**
 * Recent Searches Component
 * Displays previously searched institutions from localStorage
 */
function RecentSearches({ onSelect }: { onSelect: (name: string) => void }) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Load recent searches on mount
  useEffect(() => {
    const stored = localStorage.getItem("recentSearches");
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Save a search to recent searches
  const addRecentSearch = (name: string) => {
    const updated = [name, ...recentSearches.filter((s) => s !== name)].slice(
      0,
      5
    );
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  };

  const handleRecentClick = (name: string) => {
    onSelect(name);
    addRecentSearch(name);
    setShowRecentSearches(false);
  };

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowRecentSearches(!showRecentSearches)}
        className="px-4 py-3 rounded-md border border-border text-text-secondary hover:text-text transition-colors text-sm"
      >
        Recent ({recentSearches.length})
      </button>

      {showRecentSearches && (
        <div className="absolute top-full right-0 mt-2 bg-bg-secondary border border-border rounded-md shadow-lg z-dropdown min-w-48">
          {recentSearches.map((search, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleRecentClick(search)}
              className="w-full text-left px-4 py-2 hover:bg-bg-tertiary transition-colors text-sm truncate"
            >
              {search}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
