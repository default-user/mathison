-- Mathison Memory Graph - PostgreSQL Schema
-- Phase 2: Persistent hypergraph storage
--
-- Design principles:
-- - Nodes and edges as separate tables
-- - Hyperedges as n-ary relationships
-- - JSONB for flexible data storage
-- - Indexes optimized for graph traversal
-- - Audit trail via timestamps

CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edges (
    id VARCHAR(255) PRIMARY KEY,
    source VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hyperedges (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hyperedge_nodes (
    hyperedge_id VARCHAR(255) NOT NULL REFERENCES hyperedges(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (hyperedge_id, node_id, position)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_data_gin ON nodes USING GIN (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges(source, target);

CREATE INDEX IF NOT EXISTS idx_hyperedge_nodes_hyperedge_id ON hyperedge_nodes(hyperedge_id);
CREATE INDEX IF NOT EXISTS idx_hyperedge_nodes_node_id ON hyperedge_nodes(node_id);

-- Full-text search support for node data
CREATE INDEX IF NOT EXISTS idx_nodes_data_text ON nodes USING GIN (
    to_tsvector('english', COALESCE(data->>'name', '') || ' ' || COALESCE(data->>'description', ''))
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_nodes_updated_at BEFORE UPDATE ON nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_edges_updated_at BEFORE UPDATE ON edges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hyperedges_updated_at BEFORE UPDATE ON hyperedges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE OR REPLACE VIEW node_summary AS
SELECT
    type,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM nodes
GROUP BY type;

CREATE OR REPLACE VIEW edge_summary AS
SELECT
    type,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM edges
GROUP BY type;
