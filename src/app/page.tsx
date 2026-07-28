"use client";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Mock data for dashboard
const verdictDistribution = [
  { name: "Genuine", value: 4521, color: "#22c55e" },
  { name: "Likely Genuine", value: 1203, color: "#06b6d4" },
  { name: "Unknown", value: 892, color: "#f59e0b" },
  { name: "Unverified", value: 456, color: "#64748b" },
  { name: "Fake", value: 234, color: "#ef4444" },
];

const validationsTrend = [
  { date: "Day 1", count: 145 },
  { date: "Day 2", count: 189 },
  { date: "Day 3", count: 167 },
  { date: "Day 4", count: 234 },
  { date: "Day 5", count: 198 },
  { date: "Day 6", count: 267 },
  { date: "Day 7", count: 312 },
];

const performanceMetrics = [
  { tier: "Fast", p50: 45, p95: 120 },
  { tier: "Mirror", p50: 520, p95: 1200 },
  { tier: "Live", p50: 3200, p95: 8500 },
  { tier: "Full", p50: 12000, p95: 25000 },
];

const cacheStats = [
  { layer: "L1 (Memory)", hitRate: 68 },
  { layer: "L2 (Redis)", hitRate: 23 },
  { layer: "L3 (DB)", hitRate: 7 },
  { layer: "L4 (Live)", hitRate: 2 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display font-bold">Dashboard</h1>
        <p className="text-text-secondary mt-2">Overview of validations and system health</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Total Validations</div>
          <div className="text-3xl font-bold mt-2">7,306</div>
          <div className="text-xs text-success mt-1">+312 today</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Avg Response Time</div>
          <div className="text-3xl font-bold mt-2">1.2s</div>
          <div className="text-xs text-success mt-1">↓ 8% vs yesterday</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">Cache Hit Rate</div>
          <div className="text-3xl font-bold mt-2">68%</div>
          <div className="text-xs text-success mt-1">L1 + L2 combined</div>
        </div>
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <div className="text-sm text-text-secondary font-medium">System Health</div>
          <div className="text-3xl font-bold mt-2 text-success">Healthy</div>
          <div className="text-xs text-success mt-1">All services online</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Verdict Distribution */}
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Verdict Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={verdictDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {verdictDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Validations Trend */}
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Validations Over Time (30d)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={validationsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Response Time by Tier */}
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Performance (p50 / p95)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="tier" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
              <Legend />
              <Bar dataKey="p50" fill="#2563eb" name="p50 (ms)" />
              <Bar dataKey="p95" fill="#06b6d4" name="p95 (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cache Hit Rate by Layer */}
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Cache Hit Rate by Layer</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cacheStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="layer" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
              <Bar dataKey="hitRate" fill="#22c55e" name="Hit Rate (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Alerts</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-warning">
            <div className="w-2 h-2 bg-warning rounded-full"></div>
            <span>SearXNG snapshot last ingested 2 days ago (schedule: daily)</span>
          </div>
          <div className="flex items-center gap-2 text-success">
            <div className="w-2 h-2 bg-success rounded-full"></div>
            <span>All browser circuits closed (healthy)</span>
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <div className="w-2 h-2 bg-text-tertiary rounded-full"></div>
            <span>No dead letters in retry queue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
