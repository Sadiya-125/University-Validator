"use client";

import { useState } from "react";
import { Search, Download, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";

const mockRecords = [
  {
    id: "inst-001",
    name: "Indian Institute of Technology Bombay",
    verdict: "genuine",
    confidence: 0.98,
    validated: "2 hours ago",
    authorities: 8,
  },
  {
    id: "inst-002",
    name: "Delhi University",
    verdict: "genuine",
    confidence: 0.95,
    validated: "4 hours ago",
    authorities: 6,
  },
  {
    id: "inst-003",
    name: "Fake University Global",
    verdict: "fake",
    confidence: 0.92,
    validated: "1 day ago",
    authorities: 3,
  },
  {
    id: "inst-004",
    name: "Mumbai Institute of Technology",
    verdict: "likely_genuine",
    confidence: 0.76,
    validated: "2 days ago",
    authorities: 5,
  },
  {
    id: "inst-005",
    name: "Unknown College of Engineering",
    verdict: "unknown",
    confidence: 0.45,
    validated: "3 days ago",
    authorities: 2,
  },
];

const verdictColors = {
  genuine: "bg-success/10 text-success border-success/30",
  likely_genuine: "bg-info/10 text-info border-info/30",
  unknown: "bg-warning/10 text-warning border-warning/30",
  unverified: "bg-neutral-500/10 text-neutral-500 border-neutral-500/30",
  fake: "bg-danger/10 text-danger border-danger/30",
};

export default function RecordsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVerdict, setSelectedVerdict] = useState<string | null>(null);

  const filtered = mockRecords.filter((record) => {
    const matchesSearch = record.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVerdict = !selectedVerdict || record.verdict === selectedVerdict;
    return matchesSearch && matchesVerdict;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display font-bold">Records</h1>
        <p className="text-text-secondary mt-2">Browse and manage validated institutions</p>
      </div>

      {/* Filters */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search institutions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-md bg-bg border-2 border-border transition-colors text-text placeholder-text-secondary focus:outline-none focus:border-primary"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-bg-tertiary transition-colors">
            <Download size={18} />
            Export
          </button>
        </div>

        {/* Verdict Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-secondary">Filter by verdict:</span>
          {["genuine", "likely_genuine", "unknown", "unverified", "fake"].map((v) => (
            <button
              key={v}
              onClick={() => setSelectedVerdict(selectedVerdict === v ? null : v)}
              className={`px-3 py-1 rounded-full text-sm transition-all ${
                selectedVerdict === v
                  ? `${verdictColors[v as keyof typeof verdictColors]} border`
                  : "bg-bg border border-border text-text-secondary hover:text-text"
              }`}
            >
              {v.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold">Institution</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Verdict</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Confidence</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Authorities</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Validated</th>
              <th className="px-6 py-4 text-center text-sm font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((record) => (
              <tr key={record.id} className="hover:bg-bg transition-colors">
                <td className="px-6 py-4 text-sm font-medium">{record.name}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${
                      verdictColors[record.verdict as keyof typeof verdictColors]
                    }`}
                  >
                    {record.verdict.replace("_", " ")}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${record.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-text-secondary">{(record.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-text-secondary">{record.authorities} sources</td>
                <td className="px-6 py-4 text-sm text-text-secondary">{record.validated}</td>
                <td className="px-6 py-4 text-center">
                  <Link href={`/records/${record.id}`}>
                    <button className="p-2 hover:bg-bg rounded-lg transition-colors">
                      <ChevronRight size={18} className="text-primary" />
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-text-secondary">No records found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-text-secondary">
          Showing <span className="font-semibold text-text">{filtered.length}</span> of{" "}
          <span className="font-semibold text-text">{mockRecords.length}</span> records
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 border border-border rounded-lg hover:bg-bg-tertiary transition-colors disabled:opacity-50" disabled>
            Previous
          </button>
          <button className="px-4 py-2 border border-border rounded-lg hover:bg-bg-tertiary transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
