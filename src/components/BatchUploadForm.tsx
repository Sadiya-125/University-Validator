'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';

interface CsvRow {
  institution_name?: string;
  university_name?: string;
  state?: string;
  district?: string;
  [key: string]: any;
}

interface UploadError {
  row: number;
  field: string;
  message: string;
}

export default function BatchUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [uploading, setUploading] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [preview, setPreview] = useState(true);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);

    // Parse CSV in a Web Worker for large files
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as CsvRow[];
        const newErrors: UploadError[] = [];

        // Validate rows
        const validRows = rows.filter((row, idx) => {
          if (!row.institution_name || row.institution_name.trim() === '') {
            newErrors.push({
              row: idx + 2, // +2 for header and 1-indexing
              field: 'institution_name',
              message: 'Institution name is required',
            });
            return false;
          }
          if (row.institution_name.length > 512) {
            newErrors.push({
              row: idx + 2,
              field: 'institution_name',
              message: 'Institution name is too long (max 512 chars)',
            });
            return false;
          }
          return true;
        });

        setCsvData(validRows);
        setErrors(newErrors);

        // Auto-populate batch name from filename
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
        setBatchName(nameWithoutExt);
      },
      error: (error) => {
        setErrors([{ row: 0, field: 'file', message: `Failed to parse CSV: ${error.message}` }]);
      },
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv'))) {
      const inputEvent = {
        target: {
          files: e.dataTransfer.files,
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(inputEvent);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!batchName.trim()) {
      setErrors([{ row: 0, field: 'name', message: 'Batch name is required' }]);
      return;
    }

    if (csvData.length === 0) {
      setErrors([{ row: 0, field: 'file', message: 'No valid rows in CSV' }]);
      return;
    }

    setUploading(true);

    try {
      // Create batch via API
      const response = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName,
          items: csvData.map((row) => ({
            institution_name: row.institution_name,
            university_name: row.university_name,
            state: row.state,
            district: row.district,
          })),
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to batch detail page
        router.push(`/batches/${result.batchId}`);
      } else {
        setErrors([{
          row: 0,
          field: 'submit',
          message: result.error || 'Failed to create batch',
        }]);
      }
    } catch (error) {
      setErrors([{
        row: 0,
        field: 'submit',
        message: error instanceof Error ? error.message : 'An error occurred',
      }]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Drag & Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="text-gray-600">
            <p className="text-lg font-medium mb-2">Drag CSV file here or click to browse</p>
            <p className="text-sm text-gray-500">
              Required column: <strong>institution_name</strong>
              <br />
              Optional columns: university_name, state, district
            </p>
          </div>
        </div>

        {/* Batch Name Input */}
        {csvData.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Name
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g., AICTE Export Q3 2026"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800 mb-2">
              {errors.length} error{errors.length !== 1 ? 's' : ''} found:
            </p>
            <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
              {errors.slice(0, 10).map((err, idx) => (
                <li key={idx}>
                  {err.row > 0 ? `Row ${err.row}, ` : ''}{err.field}: {err.message}
                </li>
              ))}
              {errors.length > 10 && (
                <li className="text-red-600 font-medium">
                  ...and {errors.length - 10} more errors
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Preview */}
        {csvData.length > 0 && preview && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">
                Preview ({csvData.length} rows)
              </p>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Hide
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Institution</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">University</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">State</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2 text-gray-900 font-medium">{row.institution_name}</td>
                      <td className="px-3 py-2 text-gray-600">{row.university_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.state || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length > 5 && (
                <p className="text-xs text-gray-500 mt-2">
                  ...and {csvData.length - 5} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        {csvData.length > 0 && (
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={uploading || errors.length > 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {uploading ? 'Creating batch...' : `Create Batch (${csvData.length} items)`}
            </button>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setCsvData([]);
                setBatchName('');
                setErrors([]);
                setPreview(true);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Clear
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
