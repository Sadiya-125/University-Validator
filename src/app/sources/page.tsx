"use client";

import { RefreshCw, Check, AlertCircle, Clock } from "lucide-react";

const authorities = [
  {
    code: "UGC",
    name: "University Grants Commission",
    lastSync: "2 hours ago",
    rowCount: 28451,
    drift: 12,
    nextScheduled: "in 10 hours",
    status: "healthy" as const,
  },
  {
    code: "AICTE",
    name: "All India Council for Technical Education",
    lastSync: "5 hours ago",
    rowCount: 15632,
    drift: 5,
    nextScheduled: "in 7 hours",
    status: "healthy" as const,
  },
  {
    code: "NMC",
    name: "National Medical Commission",
    lastSync: "1 day ago",
    rowCount: 8945,
    drift: 28,
    nextScheduled: "in 3 hours",
    status: "warning" as const,
  },
  {
    code: "NCTE",
    name: "National Council for Teacher Education",
    lastSync: "12 hours ago",
    rowCount: 5234,
    drift: 3,
    nextScheduled: "in 6 hours",
    status: "healthy" as const,
  },
  {
    code: "PCI",
    name: "Pharmacy Council of India",
    lastSync: "2 days ago",
    rowCount: 3891,
    drift: 42,
    nextScheduled: "in 2 hours",
    status: "warning" as const,
  },
  {
    code: "COA",
    name: "Council of Architecture",
    lastSync: "3 days ago",
    rowCount: 4156,
    drift: 15,
    nextScheduled: "in 1 hour",
    status: "critical" as const,
  },
];

const statusIcons = {
  healthy: <Check className="w-5 h-5 text-success" />,
  warning: <AlertCircle className="w-5 h-5 text-warning" />,
  critical: <AlertCircle className="w-5 h-5 text-danger" />,
};

export default function SourcesPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display font-bold">Data Sources</h1>
        <p className="text-text-secondary mt-2">Manage authority snapshots and ingest schedules</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Total Institutions</div>
          <div className="text-3xl font-bold mt-2">66,309</div>
          <div className="text-xs text-text-tertiary mt-1">Across 6 authorities</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Avg Snapshot Age</div>
          <div className="text-3xl font-bold mt-2">1.2d</div>
          <div className="text-xs text-warning mt-1">1 authority overdue</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Data Drift (24h)</div>
          <div className="text-3xl font-bold mt-2">+105</div>
          <div className="text-xs text-text-tertiary mt-1">New institutions detected</div>
        </div>
      </div>

      {/* Sources Table */}
      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold">Authority</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Row Count</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Last Synced</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Drift (24h)</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Next Sync</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Status</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {authorities.map((auth) => (
              <tr key={auth.code} className="hover:bg-bg transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-sm">{auth.name}</div>
                    <div className="text-xs text-text-tertiary">{auth.code}</div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-text-secondary">{auth.rowCount.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-text-secondary">{auth.lastSync}</td>
                <td className="px-6 py-4">
                  <span className={`text-sm font-medium ${auth.drift > 20 ? "text-warning" : "text-success"}`}>
                    +{auth.drift}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Clock size={14} />
                    {auth.nextScheduled}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">{statusIcons[auth.status]}</td>
                <td className="px-6 py-4 text-center">
                  <button className="p-2 hover:bg-bg rounded-lg transition-colors group">
                    <RefreshCw size={16} className="text-primary group-hover:animate-spin" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sync History */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Sync Activity</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <div className="text-sm font-medium">UGC snapshot validated</div>
              <div className="text-xs text-text-tertiary">28,451 institutions · 0 errors</div>
            </div>
            <div className="text-xs text-success">✓ 2 hours ago</div>
          </div>
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <div className="text-sm font-medium">AICTE snapshot validated</div>
              <div className="text-xs text-text-tertiary">15,632 institutions · 0 errors</div>
            </div>
            <div className="text-xs text-success">✓ 5 hours ago</div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">COA snapshot rejected</div>
              <div className="text-xs text-text-tertiary">Missing expected columns: state_code</div>
            </div>
            <div className="text-xs text-danger">✗ 3 days ago</div>
          </div>
        </div>
      </div>
    </div>
  );
}
