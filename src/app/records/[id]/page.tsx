"use client";

/**
 * Institution Details Page (/records/[id])
 *
 * Displays:
 * - Institution details from canonical database
 * - Contact information (email, phone, website)
 * - Links and identities
 * - Enrich button to extract details from website
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  AlertCircle,
  CheckCircle,
  Loader,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface EnrichedInstitution {
  institution: {
    id: number;
    canonicalName: string;
    normalizedName: string;
    type: string;
    state?: string;
    district?: string;
    pincode?: string;
    address?: string;
    website?: string;
    verdict?: string;
    confidence?: number;
  };
  contacts: Array<{
    kind: string;
    value: string;
  }>;
  links: Array<{
    platform: string;
    url: string;
    title?: string;
  }>;
  identities: Array<{
    source: string;
    externalId: string;
  }>;
}

interface Props {
  params: { id: string };
}

export default function InstitutionDetailsPage({ params }: Props) {
  const institutionId = parseInt(params.id, 10);
  const [enriched, setEnriched] = useState<EnrichedInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchEnrichedData();
  }, [institutionId]);

  async function fetchEnrichedData() {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/institutions/enrich-details?institutionId=${institutionId}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch details");
      }

      const data = await response.json();
      setEnriched(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrich() {
    if (!enriched?.institution.website) {
      setEnrichmentStatus("Website URL is required to enrich contact details");
      return;
    }

    setEnriching(true);
    setEnrichmentStatus("Extracting contact details from website...");

    try {
      const response = await fetch("/api/institutions/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enrich_entry",
          institutionId: institutionId,
        }),
      });

      if (response.ok) {
        setEnrichmentStatus("✓ Details enriched successfully!");
        // Refresh data after a delay
        setTimeout(() => {
          fetchEnrichedData();
          setEnrichmentStatus(null);
        }, 2000);
      } else {
        const errorData = await response.json();
        setEnrichmentStatus(`Error: ${errorData.error || "Enrichment failed"}`);
      }
    } catch (err) {
      setEnrichmentStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setEnriching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading institution details...</p>
        </div>
      </div>
    );
  }

  if (error || !enriched) {
    return (
      <div className="min-h-screen bg-red-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex gap-4">
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
              <div>
                <h1 className="text-lg font-semibold text-red-900">Error Loading Details</h1>
                <p className="text-red-700 mt-2">{error || "No data found"}</p>
                <Link href="/records" className="text-red-600 hover:text-red-800 mt-4 inline-block">
                  ← Back to Records
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { institution, contacts, links, identities } = enriched;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">{institution.canonicalName}</h1>
              <p className="text-gray-600 mt-2 text-sm">
                ID: {institutionId} · Normalized: {institution.normalizedName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {institution.verdict && (
                <div
                  className={`px-4 py-2 rounded-full font-medium text-sm ${
                    institution.verdict === "Genuine"
                      ? "bg-green-100 text-green-800"
                      : institution.verdict === "Likely Genuine"
                        ? "bg-blue-100 text-blue-800"
                        : institution.verdict === "Fake"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {institution.verdict}
                </div>
              )}
            </div>
          </div>

          {institution.confidence !== undefined && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">Confidence Score</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(institution.confidence || 0) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-700 mt-2 font-medium">
                {Math.round((institution.confidence || 0) * 100)}%
              </p>
            </div>
          )}

          {/* Enrich Button */}
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div>
              <p className="text-sm font-semibold text-blue-900">✨ Enrich Contact Details</p>
              <p className="text-xs text-blue-700 mt-1">
                Fetch and extract additional information from the institution's website
              </p>
            </div>
            <button
              onClick={handleEnrich}
              disabled={enriching || !institution.website}
              title={!institution.website ? "Website URL is required" : "Click to enrich details"}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <RefreshCw size={16} className={enriching ? "animate-spin" : ""} />
              {enriching ? "Enriching..." : "Enrich"}
            </button>
          </div>

          {enrichmentStatus && (
            <div
              className={`mt-4 p-4 rounded-lg text-sm font-medium ${
                enrichmentStatus.startsWith("✓")
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : enrichmentStatus.startsWith("Error")
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-blue-50 text-blue-800 border border-blue-200"
              }`}
            >
              {enrichmentStatus}
            </div>
          )}
        </div>

        {/* Location Info */}
        {(institution.state || institution.district || institution.address) && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-600" />
              Location & Address
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {institution.state && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    State
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-2">{institution.state}</p>
                </div>
              )}
              {institution.district && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    District
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-2">{institution.district}</p>
                </div>
              )}
              {institution.pincode && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Pincode
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-2">{institution.pincode}</p>
                </div>
              )}
              {institution.type && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Type
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-2 capitalize">
                    {institution.type.replace(/_/g, " ")}
                  </p>
                </div>
              )}
            </div>
            {institution.address && (
              <div className="mt-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-900 font-medium mb-2">Address</p>
                <p className="text-gray-800 text-sm leading-relaxed">{institution.address}</p>
              </div>
            )}
          </div>
        )}

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>

          {contacts.length > 0 ? (
            <div className="space-y-3">
              {contacts.map((contact, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {contact.kind === "email" && (
                    <>
                      <Mail className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                          Email
                        </p>
                        <a
                          href={`mailto:${contact.value}`}
                          className="text-blue-600 hover:text-blue-800 font-medium truncate block"
                        >
                          {contact.value}
                        </a>
                      </div>
                    </>
                  )}

                  {contact.kind === "phone" && (
                    <>
                      <Phone className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                          Phone
                        </p>
                        <a
                          href={`tel:${contact.value}`}
                          className="text-green-600 hover:text-green-800 font-medium"
                        >
                          {contact.value}
                        </a>
                      </div>
                    </>
                  )}

                  {contact.kind === "website" && (
                    <>
                      <Globe className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                          Website
                        </p>
                        <a
                          href={contact.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:text-purple-800 font-medium truncate flex items-center gap-1"
                        >
                          {contact.value}
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </>
                  )}

                  {contact.kind === "fax" && (
                    <div className="flex-1">
                      <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                        Fax
                      </p>
                      <p className="text-gray-900 font-medium">{contact.value}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No contact information available</p>
          )}
        </div>

        {/* Website Links */}
        {links.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-600" />
              Links
            </h2>
            <div className="space-y-3">
              {links.map((link, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-600 font-medium capitalize">
                      {link.platform.replace(/_/g, " ")}
                    </p>
                    {link.title && <p className="text-sm text-gray-700 mt-1">{link.title}</p>}
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                  >
                    Visit
                    <ExternalLink size={14} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Authority Records */}
        {identities.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-gray-600" />
              Authority Records ({identities.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {identities.map((identity, i) => (
                <div
                  key={i}
                  className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200"
                >
                  <p className="text-sm text-blue-600 font-bold uppercase tracking-wider">
                    {identity.source}
                  </p>
                  <p className="text-xs text-blue-700 mt-2 font-mono break-all">
                    {identity.externalId}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
          <Link
            href="/records"
            className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2"
          >
            ← Back to Records
          </Link>
          <button
            onClick={fetchEnrichedData}
            className="text-gray-600 hover:text-gray-800 font-medium flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
