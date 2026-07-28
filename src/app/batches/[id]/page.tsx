'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface BatchData {
  id: number;
  name: string;
  total: number;
  queued: number;
  succeeded: number;
  failed: number;
  state: string;
  progress: number;
  createdAt: Date;
  finishedAt?: Date;
}

interface BatchItem {
  id: number;
  rowNo: number;
  inputName: string;
  inputUniversity?: string;
  state: string;
  error?: string;
  verdict?: string;
  confidence?: number;
  createdAt: Date;
}

interface ItemsResponse {
  success: boolean;
  data?: {
    items: BatchItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: string;
}

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<BatchData | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch batch details
  const fetchBatch = async () => {
    try {
      const response = await fetch(`/api/batches/${batchId}`);
      const result = await response.json();
      if (result.success) {
        setBatch(result.data);
      } else {
        setError(result.error || 'Failed to fetch batch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching batch');
    }
  };

  // Fetch batch items
  const fetchItems = async () => {
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(statusFilter && { status: statusFilter }),
      });
      const response = await fetch(`/api/batches/${batchId}/items?${query}`);
      const result: ItemsResponse = await response.json();
      if (result.success && result.data) {
        setItems(result.data.items);
        setTotalPages(result.data.totalPages);
      } else {
        setError(result.error || 'Failed to fetch items');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching items');
    }
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchBatch();
      await fetchItems();
      setLoading(false);
    };
    loadData();
  }, [batchId, page, statusFilter]);

  // Auto-refresh while processing
  useEffect(() => {
    if (!autoRefresh || !batch || batch.state === 'completed' || batch.state === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      await fetchBatch();
      await fetchItems();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, batch?.state, batchId]);

  if (loading && !batch) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-600">Loading batch details...</p>
        </div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-red-700">{error || 'Batch not found'}</p>
          <Link href="/batches" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to Batches
          </Link>
        </div>
      </div>
    );
  }

  const completed = batch.succeeded + batch.failed;
  const isProcessing = batch.state === 'running' || batch.state === 'queued';
  const throughputValue = completed > 0 ? completed / ((Date.now() - new Date(batch.createdAt).getTime()) / 1000 / 60) : 0;
  const throughput = throughputValue.toFixed(2);
  const remainingItems = batch.total - completed;
  const estimatedMinutes = remainingItems > 0 && throughputValue > 0 ? (remainingItems / throughputValue).toFixed(0) : '—';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{batch.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Batch ID: {batch.id} • Created {new Date(batch.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              batch.state === 'completed' ? 'bg-green-100 text-green-800' :
              batch.state === 'failed' ? 'bg-red-100 text-red-800' :
              batch.state === 'running' ? 'bg-blue-100 text-blue-800' :
              batch.state === 'cancelled' ? 'bg-gray-100 text-gray-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {batch.state.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Progress</p>
            <p className="text-sm text-gray-600">{batch.progress}%</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${batch.progress}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Total Items</p>
            <p className="text-2xl font-bold text-gray-900">{batch.total}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Queued</p>
            <p className="text-2xl font-bold text-blue-900">{batch.queued}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Succeeded</p>
            <p className="text-2xl font-bold text-green-900">{batch.succeeded}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Failed</p>
            <p className="text-2xl font-bold text-red-900">{batch.failed}</p>
          </div>
        </div>

        {/* Throughput & ETA */}
        {isProcessing && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Throughput</p>
              <p className="text-xl font-bold text-purple-900">{throughput} items/min</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Estimated Time</p>
              <p className="text-xl font-bold text-orange-900">{estimatedMinutes} min</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-3 py-2 rounded text-sm font-medium ${
            autoRefresh
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {autoRefresh ? '⏸ Auto-refresh' : '▶ Auto-refresh'}
        </button>
        <button
          onClick={() => { fetchBatch(); fetchItems(); }}
          className="px-3 py-2 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          🔄 Refresh
        </button>
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded text-sm border border-gray-300 bg-white"
        >
          <option value="">All Items</option>
          <option value="pending">Pending</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Row</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Institution Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Verdict</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Confidence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Error</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-600">
                  No items found
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{item.rowNo}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{item.inputName}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      item.state === 'succeeded' ? 'bg-green-100 text-green-800' :
                      item.state === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.verdict || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {item.confidence ? `${(item.confidence * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate" title={item.error}>
                    {item.error ? '⚠ ' + item.error.substring(0, 30) + '...' : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages} ({items.length} items)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Link href="/batches" className="text-blue-600 hover:underline">
          ← Back to Batches
        </Link>
      </div>
    </div>
  );
}
