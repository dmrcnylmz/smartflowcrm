/**
 * Metrics Service — Phase 11 Observability
 * 
 * In-memory metrics store with Prometheus-compatible text output.
 * Tracks counters and histograms for voice pipeline performance.
 */

class MetricsService {
    constructor() {
        this._counters = {};
        this._histograms = {};
        this._gauges = {};
    }

    // ─── Counters ────────────────────────────────────

    inc(name, labels = {}, value = 1) {
        const key = this._key(name, labels);
        this._counters[key] = (this._counters[key] || 0) + value;
    }

    getCounter(name, labels = {}) {
        return this._counters[this._key(name, labels)] || 0;
    }

    // ─── Gauges ──────────────────────────────────────

    setGauge(name, value, labels = {}) {
        this._gauges[this._key(name, labels)] = value;
    }

    getGauge(name, labels = {}) {
        return this._gauges[this._key(name, labels)] || 0;
    }

    // ─── Histograms ──────────────────────────────────

    observe(name, value, labels = {}) {
        const key = this._key(name, labels);
        if (!this._histograms[key]) {
            this._histograms[key] = { count: 0, sum: 0, buckets: {}, min: Infinity, max: -Infinity };
        }
        const h = this._histograms[key];
        h.count++;
        h.sum += value;
        if (value < h.min) h.min = value;
        if (value > h.max) h.max = value;

        // Standard latency buckets (ms)
        const buckets = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
        for (const b of buckets) {
            if (!h.buckets[b]) h.buckets[b] = 0;
            if (value <= b) h.buckets[b]++;
        }
    }

    getHistogram(name, labels = {}) {
        const h = this._histograms[this._key(name, labels)];
        if (!h) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
        return {
            count: h.count,
            sum: Math.round(h.sum * 100) / 100,
            avg: Math.round((h.sum / h.count) * 100) / 100,
            min: h.min === Infinity ? 0 : Math.round(h.min * 100) / 100,
            max: h.max === -Infinity ? 0 : Math.round(h.max * 100) / 100,
            buckets: h.buckets
        };
    }

    // ─── Prometheus text format ──────────────────────

    toPrometheus() {
        const lines = [];
        lines.push('# Call Center Platform Metrics\n');

        // Counters
        for (const [key, value] of Object.entries(this._counters)) {
            const { name, labels } = this._parseKey(key);
            const labelStr = this._labelStr(labels);
            lines.push(`# TYPE ${name} counter`);
            lines.push(`${name}${labelStr} ${value}`);
        }

        // Gauges
        for (const [key, value] of Object.entries(this._gauges)) {
            const { name, labels } = this._parseKey(key);
            const labelStr = this._labelStr(labels);
            lines.push(`# TYPE ${name} gauge`);
            lines.push(`${name}${labelStr} ${value}`);
        }

        // Histograms
        for (const [key, h] of Object.entries(this._histograms)) {
            const { name, labels } = this._parseKey(key);
            const labelStr = this._labelStr(labels);
            lines.push(`# TYPE ${name} histogram`);
            lines.push(`${name}_count${labelStr} ${h.count}`);
            lines.push(`${name}_sum${labelStr} ${Math.round(h.sum * 100) / 100}`);
            if (h.buckets) {
                for (const [b, count] of Object.entries(h.buckets)) {
                    lines.push(`${name}_bucket{le="${b}"${labelStr ? ',' + labelStr.slice(1, -1) : ''}} ${count}`);
                }
            }
        }

        return lines.join('\n');
    }

    // ─── JSON summary ────────────────────────────────

    toJSON() {
        const result = { counters: {}, gauges: {}, histograms: {} };

        for (const [key, value] of Object.entries(this._counters)) {
            result.counters[key] = value;
        }
        for (const [key, value] of Object.entries(this._gauges)) {
            result.gauges[key] = value;
        }
        for (const [key, h] of Object.entries(this._histograms)) {
            result.histograms[key] = this.getHistogram(...this._parseKeyArgs(key));
        }

        return result;
    }

    // ─── Reset ───────────────────────────────────────

    reset() {
        this._counters = {};
        this._histograms = {};
        this._gauges = {};
    }

    // ─── Internal ────────────────────────────────────

    _key(name, labels = {}) {
        const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
        if (sorted.length === 0) return name;
        return `${name}{${sorted.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
    }

    _parseKey(key) {
        const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
        if (!match) return { name: key, labels: {} };
        const name = match[1];
        const labels = {};
        if (match[2]) {
            match[2].split(',').forEach(pair => {
                const [k, v] = pair.split('=');
                labels[k] = v.replace(/"/g, '');
            });
        }
        return { name, labels };
    }

    _parseKeyArgs(key) {
        const { name, labels } = this._parseKey(key);
        return [name, labels];
    }

    _labelStr(labels) {
        const entries = Object.entries(labels);
        if (entries.length === 0) return '';
        return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
    }
}

module.exports = new MetricsService();
