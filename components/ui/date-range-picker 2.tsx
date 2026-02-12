'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClear?: () => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn('flex items-end gap-2', className)}>
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground">Başlangıç</Label>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="pl-10"
            max={endDate || undefined}
          />
        </div>
      </div>
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground">Bitiş</Label>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="pl-10"
            min={startDate || undefined}
          />
        </div>
      </div>
      {(startDate || endDate) && onClear && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="mb-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

