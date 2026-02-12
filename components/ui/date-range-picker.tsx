"use client";

import * as React from "react";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarRange, RotateCcw, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateRangePickerProps = {
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (value: string) => void;
  onEndDateChange?: (value: string) => void;
  onClear?: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
};

type QuickRange = {
  key: string;
  label: string;
  getRange: () => { from: Date; to: Date };
};

const WEEK_OPTIONS = { weekStartsOn: 1 as const };

const QUICK_RANGES: QuickRange[] = [
  {
    key: "today",
    label: "Bugün",
    getRange: () => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    key: "yesterday",
    label: "Dün",
    getRange: () => {
      const yesterday = subDays(new Date(), 1);
      return { from: yesterday, to: yesterday };
    },
  },
  {
    key: "last7",
    label: "Son 7 Gün",
    getRange: () => {
      const end = new Date();
      const start = subDays(end, 6);
      return { from: start, to: end };
    },
  },
  {
    key: "thisWeek",
    label: "Bu Hafta",
    getRange: () => {
      const now = new Date();
      return {
        from: startOfWeek(now, WEEK_OPTIONS),
        to: endOfWeek(now, WEEK_OPTIONS),
      };
    },
  },
  {
    key: "thisMonth",
    label: "Bu Ay",
    getRange: () => {
      const now = new Date();
      return { from: startOfMonth(now), to: endOfMonth(now) };
    },
  },
];

export function DateRangePicker({
  startDate = "",
  endDate = "",
  onStartDateChange = () => {},
  onEndDateChange = () => {},
  onClear,
  label = "Tarih Aralığı",
  className,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedRange = React.useMemo<DateRange | undefined>(() => {
    const from = parseISODate(startDate);
    const to = parseISODate(endDate);
    if (!from && !to) return undefined;
    return { from: from ?? to ?? undefined, to: to ?? from ?? undefined };
  }, [startDate, endDate]);

  const displayValue = React.useMemo(() => {
    if (startDate && endDate) {
      return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
    }
    if (startDate) return `${formatDisplayDate(startDate)} → `;
    if (endDate) return `← ${formatDisplayDate(endDate)}`;
    return "Tarih seçin";
  }, [startDate, endDate]);

  function updateRange(range?: DateRange) {
    if (!range) {
      clearSelection();
      return;
    }

    if (range.from) {
      onStartDateChange(formatISODate(range.from));
    } else {
      onStartDateChange("");
    }

    if (range.to) {
      onEndDateChange(formatISODate(range.to));
      setOpen(false);
    } else {
      onEndDateChange("");
    }
  }

  function clearSelection() {
    onStartDateChange("");
    onEndDateChange("");
    onClear?.();
  }

  function handleQuickRange(rangeBuilder: QuickRange["getRange"]) {
    const { from, to } = rangeBuilder();
    onStartDateChange(formatISODate(from));
    onEndDateChange(formatISODate(to));
    setOpen(false);
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "justify-start text-left font-normal min-w-[260px]",
                !startDate && !endDate && "text-muted-foreground"
              )}
              disabled={disabled}
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              {displayValue}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={selectedRange}
              defaultMonth={selectedRange?.from ?? new Date()}
              onSelect={updateRange}
              locale={tr}
            />
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <div>
                {selectedRange?.from
                  ? `Seçilen: ${displayValue}`
                  : "Tarih aralığı seçin"}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => {
                  clearSelection();
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Temizle
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map((quick) => (
            <Button
              key={quick.key}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="gap-1"
              onClick={() => handleQuickRange(quick.getRange)}
            >
              {quick.key === "last7" ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <CalendarRange className="h-3.5 w-3.5" />
              )}
              {quick.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function parseISODate(value?: string) {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const date = parseISODate(value);
  if (!date) return value;
  return format(date, "d MMM yyyy", { locale: tr });
}

