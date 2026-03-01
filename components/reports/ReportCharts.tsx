'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { TrendingUp, PhoneIncoming } from 'lucide-react';

// --- Types ---

export interface ReportSummary {
  totalCalls: number;
  missedCalls: number;
  answeredCalls: number;
  avgCallDuration: number;
  openComplaints: number;
  totalComplaints: number;
  resolvedComplaints: number;
  openInfoRequests: number;
  scheduledAppointments: number;
  completedAppointments: number;
}

interface ReportChartsProps {
  summary: ReportSummary;
}

/**
 * Report chart section -- lazy-loaded to keep recharts (~100KB)
 * out of the initial bundle.
 */
export default function ReportCharts({ summary }: ReportChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bar Chart - Performance Overview */}
      <Card className="rounded-2xl border-none shadow-md overflow-hidden animate-fade-in-up opacity-0" style={{ animationDelay: '280ms', animationFillMode: 'forwards' }}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 font-medium">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Performans Dagilimi
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Yanitlanan', value: summary.answeredCalls, fill: '#10b981' },
                { name: 'Kacirilan', value: summary.missedCalls, fill: '#ef4444' },
                { name: 'Randevu', value: summary.scheduledAppointments, fill: '#3b82f6' },
                { name: 'Tamamlanan', value: summary.completedAppointments, fill: '#6366f1' },
                { name: 'Sikayet', value: summary.totalComplaints, fill: '#f59e0b' },
                { name: 'Cozulen', value: summary.resolvedComplaints, fill: '#22c55e' },
              ]} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                  formatter={(value: number) => [`${value} adet`, 'Miktar']}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[
                    { fill: '#10b981' }, { fill: '#ef4444' }, { fill: '#3b82f6' },
                    { fill: '#6366f1' }, { fill: '#f59e0b' }, { fill: '#22c55e' },
                  ].map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pie Chart - Call Distribution */}
      <Card className="rounded-2xl border-none shadow-md overflow-hidden animate-fade-in-up opacity-0" style={{ animationDelay: '360ms', animationFillMode: 'forwards' }}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 font-medium">
            <PhoneIncoming className="h-4 w-4 text-blue-500" />
            Cagri Dagilimi
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Yanitlanan', value: summary.answeredCalls },
                    { name: 'Kacirilan', value: summary.missedCalls },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                  labelLine={{ strokeWidth: 1 }}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                  formatter={(value: number) => [`${value} cagri`, '']}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
