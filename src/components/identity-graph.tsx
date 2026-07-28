/**
 * IdentityGraph Component
 *
 * Shows institution → identity rows per source.
 * Visualizes how the same institution is represented across different authorities.
 */

import { Link as LinkIcon, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Identity {
  id: string;
  source: string;
  name: string;
  identifiers?: Record<string, string>;
  confidence?: number;
  conflicting?: boolean;
}

interface IdentityGraphProps {
  institution: string;
  identities: Identity[];
  className?: string;
}

export function IdentityGraph({
  institution,
  identities,
  className,
}: IdentityGraphProps) {
  const grouped = identities.reduce(
    (acc, id) => {
      if (!acc[id.source]) acc[id.source] = [];
      acc[id.source]!.push(id);
      return acc;
    },
    {} as Record<string, Identity[]>
  );

  if (identities.length === 0) {
    return (
      <motion.div
        className="text-center py-8 text-text-secondary"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        No identity matches found
      </motion.div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Central Institution Node */}
      <div className="flex justify-center mb-8">
        <motion.div
          className="bg-primary/10 border-2 border-primary rounded-lg px-6 py-3"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <p className="text-sm text-text-secondary font-mono">Input</p>
          <p className="font-display font-bold text-text">{institution}</p>
        </motion.div>
      </div>

      {/* Connections to Sources */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([source, ids], sourceIdx) => (
          <motion.div
            key={source}
            className="relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sourceIdx * 0.1, duration: 0.3 }}
          >
            {/* Connection Line */}
            <motion.div
              className="absolute left-1/2 top-0 w-0.5 h-4 bg-border -translate-x-1/2 -translate-y-full"
              initial={{ scaleY: 0, originY: 0 }}
              animate={{ scaleY: 1, originY: 0 }}
              transition={{ delay: sourceIdx * 0.1 + 0.15, duration: 0.2 }}
            />

            {/* Source Header */}
            <motion.div
              className="flex items-center justify-between mb-3 px-4 py-2 bg-bg-secondary rounded-lg border border-border"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: sourceIdx * 0.1 + 0.05, duration: 0.3 }}
            >
              <h3 className="font-display font-semibold text-text">{source}</h3>
              <motion.span
                className="text-xs font-mono text-text-secondary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: sourceIdx * 0.1 + 0.15, duration: 0.2 }}
              >
                {ids.length} match{ids.length !== 1 ? "es" : ""}
              </motion.span>
            </motion.div>

            {/* Identity Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-4">
              {ids.map((id, idIdx) => (
                <motion.div
                  key={id.id}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    id.conflicting
                      ? "bg-danger/5 border-danger/20"
                      : "bg-success/5 border-success/20"
                  )}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: sourceIdx * 0.1 + 0.2 + idIdx * 0.05,
                    duration: 0.3,
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text truncate">{id.name}</p>
                      <p className="text-xs text-text-secondary font-mono">{id.id}</p>
                    </div>
                    {id.conflicting && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          delay: sourceIdx * 0.1 + 0.25 + idIdx * 0.05,
                          duration: 0.2,
                        }}
                      >
                        <AlertCircle className="w-4 h-4 text-danger shrink-0 ml-2" />
                      </motion.div>
                    )}
                  </div>

                  {/* Confidence Bar */}
                  {id.confidence !== undefined && (
                    <motion.div
                      className="mb-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        delay: sourceIdx * 0.1 + 0.3 + idIdx * 0.05,
                        duration: 0.2,
                      }}
                    >
                      <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                        <span>Match Confidence</span>
                        <span className="font-mono">{(id.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 bg-bg rounded overflow-hidden">
                        <motion.div
                          className={cn(
                            "h-full transition-all",
                            id.confidence >= 0.8
                              ? "bg-success"
                              : id.confidence >= 0.6
                                ? "bg-info"
                                : "bg-warning"
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${id.confidence * 100}%` }}
                          transition={{
                            delay: sourceIdx * 0.1 + 0.35 + idIdx * 0.05,
                            duration: 0.5,
                            ease: "easeOut",
                          }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Identifiers */}
                  {id.identifiers && Object.keys(id.identifiers).length > 0 && (
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        delay: sourceIdx * 0.1 + 0.4 + idIdx * 0.05,
                        duration: 0.2,
                      }}
                    >
                      {Object.entries(id.identifiers).map(([key, value], keyIdx) => (
                        <motion.div
                          key={key}
                          className="flex items-center gap-2 text-xs"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay:
                              sourceIdx * 0.1 +
                              0.4 +
                              idIdx * 0.05 +
                              keyIdx * 0.03,
                            duration: 0.2,
                          }}
                        >
                          <LinkIcon className="w-3 h-3 text-text-tertiary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-text-secondary">{key}: </span>
                            <span className="font-mono text-text truncate">{value}</span>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Fixture page for IdentityGraph component
 */
export function IdentityGraphFixture() {
  const sampleIdentities: Identity[] = [
    {
      id: "identity-aishe-1",
      source: "AISHE",
      name: "Indian Institute of Technology Bombay",
      identifiers: {
        "AISHE Code": "C-23432",
        "State": "Maharashtra",
      },
      confidence: 0.98,
    },
    {
      id: "identity-ugc-1",
      source: "UGC",
      name: "IIT Bombay",
      identifiers: {
        "UGC Approval": "Yes",
        "Category": "Central University",
      },
      confidence: 0.95,
    },
    {
      id: "identity-nad-1",
      source: "NAD",
      name: "IIT Bombay",
      identifiers: {
        "NAD ID": "IIT-BOM-001",
      },
      confidence: 0.92,
    },
    {
      id: "identity-web-1",
      source: "Web Search",
      name: "IIT Bombay Official Website",
      identifiers: {
        "Domain": "iitb.ac.in",
        "Type": "Official",
      },
      confidence: 0.88,
    },
    {
      id: "identity-web-2",
      source: "Web Search",
      name: "IIT Bombay - Wikipedia",
      identifiers: {
        "URL": "wikipedia.org/wiki/iit_bombay",
        "Type": "Reference",
      },
      confidence: 0.82,
    },
    {
      id: "identity-conflict-1",
      source: "Web Search",
      name: "IIT Bombay Institute",
      identifiers: {
        "Domain": "different-domain.com",
      },
      confidence: 0.45,
      conflicting: true,
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">IdentityGraph Component</h1>

      {/* Main Graph */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Institution Identity Mapping</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <IdentityGraph
            institution="IIT Bombay"
            identities={sampleIdentities}
          />
        </div>
      </section>

      {/* High Confidence Example */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">High Confidence Match</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <IdentityGraph
            institution="Stanford University"
            identities={[
              {
                id: "identity-aishe-1",
                source: "AISHE",
                name: "Stanford University",
                identifiers: {
                  "Code": "INT-STU-001",
                  "Status": "Verified",
                },
                confidence: 0.99,
              },
            ]}
          />
        </div>
      </section>

      {/* With Conflicts */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">With Conflicting Identity</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <IdentityGraph
            institution="Unknown University"
            identities={[
              {
                id: "id-1",
                source: "UGC",
                name: "Unknown University",
                confidence: 0.72,
              },
              {
                id: "id-2",
                source: "Web",
                name: "Different University Name",
                confidence: 0.40,
                conflicting: true,
              },
            ]}
          />
        </div>
      </section>

      {/* Feature Breakdown */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Hierarchical Visualization</h3>
            <p className="text-sm text-text-secondary">Central input flows to sources showing relationships and identities</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Confidence Scoring</h3>
            <p className="text-sm text-text-secondary">Visual bar showing match confidence for each identity</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Identifier Mapping</h3>
            <p className="text-sm text-text-secondary">Display key-value pairs linking to source systems</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Conflict Detection</h3>
            <p className="text-sm text-text-secondary">Red highlighting for low-confidence/conflicting identities</p>
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Semantic structure with clear hierarchy</p>
          <p>✓ Color paired with icons and text for conflicts</p>
          <p>✓ Responsive grid adapts to mobile</p>
          <p>✓ Monospace numbers for identifiers</p>
          <p>✓ Accessible connection visualization</p>
          <p>✓ Clear visual differentiation between states</p>
        </div>
      </section>
    </div>
  );
}
