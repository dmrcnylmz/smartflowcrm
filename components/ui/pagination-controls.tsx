'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationControlsProps {
  currentLimit: number;
  totalItems: number;
  filteredItems: number;
  onLimitChange: (limit: number) => void;
  onLoadMore: () => void;
  isLoading?: boolean;
  hasMore?: boolean;
  className?: string;
}

const LIMIT_OPTIONS = [25, 50, 100, 200, 500];

export function PaginationControls({
  currentLimit,
  totalItems,
  filteredItems,
  onLimitChange,
  onLoadMore,
  isLoading = false,
  hasMore = true,
  className,
}: PaginationControlsProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t', className)}>
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{filteredItems}</span> / {totalItems} kayıt gösteriliyor
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Limit:</span>
          <Select value={currentLimit.toString()} onValueChange={(v) => onLimitChange(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map(limit => (
                <SelectItem key={limit} value={limit.toString()}>
                  {limit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {hasMore && (
        <Button
          variant="outline"
          onClick={onLoadMore}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor...
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Daha Fazla Yükle
            </>
          )}
        </Button>
      )}
    </div>
  );
}

