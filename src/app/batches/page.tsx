'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BatchUploadForm from '@/components/BatchUploadForm';

interface Batch {
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

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchBatches = async () => {
    try {
      const response = await fetch('/api/batches/list');
      const result = await response.json();
      if (result.success) {
        setBatches(result.data.batches);
      } else {
        setError(result.error || 'Failed to fetch batches');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Batch Processing</h1>
        <p className="text-gray-600">Upload CSV files to validate institutions in bulk</p>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="mb-12 bg-gray-50 rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Create New Batch</h2>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-600 hover:text-gray-900 text-2xl"
            >
              ✕
            </button>
          </div>
          <BatchUploadForm />
        </div>
      )}

      {!showUpload && (
        <button
          onClick={() => setShowUpload(true)}
          className="mb-8 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
        >
          + Create New Batch
        </button>
      )}

      {/* Batches Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">
            Loading batches...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            {error}
          </div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            <p className="mb-2">No batches yet.</p>
            <p className="text-sm">Create one by uploading a CSV file above.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{batch.name}</p>
                    <p className="text-xs text-gray-500">#{batch.id}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {batch.succeeded + batch.failed} / {batch.total}
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${batch.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{batch.progress}%</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      batch.state === 'completed' ? 'bg-green-100 text-green-800' :
                      batch.state === 'failed' ? 'bg-red-100 text-red-800' :
                      batch.state === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {batch.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/batches/${batch.id}`}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
