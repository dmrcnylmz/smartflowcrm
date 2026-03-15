'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { TrendingUp, PhoneIncoming } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('charts');

  const barData = [
    { name: t('answered'), value: summary.answeredCalls, fill: '#10b981' },
    { name: t('missed'), value: summary.missedCalls, fill: '#ef4444' },
    { name: t('appointment'), value: summary.scheduledAppointments, fill: '#3b82f6' },
    { name: t('completed'), value: summary.completedAppointments, fill: '#6366f1' },
    { name: t('complaint'), value: summary.totalComplaints, fill: '#f59e0b' },
    { name: t('resolved'), value: summary.resolvedComplaints, fill: '#22c55e' },
  ];

  const pieData = [
    { name: t('answered'), value: summary.answeredCalls },
    { name: t('missed'), value: summary.missedCalls },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bar Chart - Performance Overview */}
      <Card className="rounded-2xl border-none shadow-md overflow-hidden animate-fade-in-up" style={{ animationDelay: '280ms' }}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 font-medium">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            {t('performanceDistribution')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                  formatter={(value: number) => [`${value} ${t('count')}`, t('amount')]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[
                    { fill: '#10b981' }, { fill: '#ef4444' }, { fill: '#3b82f6' },
                    { fill: '#6366f1' }, { fill: '#f59e0b' }, { fill: '#22c55e' },
                  ].map((entry, index) => (
                    <Cell key={entry.fill} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pie Chart - Call Distribution */}
      <Card className="rounded-2xl border-none shadow-md overflow-hidden animate-fade-in-up" style={{ animationDelay: '360ms' }}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 font-medium">
            <PhoneIncoming className="h-4 w-4 text-blue-500" />
            {t('callDistribution')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
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
                  formatter={(value: number) => [`${value} ${t('callUnit')}`, '']}
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
