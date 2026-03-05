"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FilterOption {
    label: string
    value: string
}

interface MultiSelectFilterProps {
    options: FilterOption[]
    selected?: string[]
    selectedValues?: string[]
    onChange?: (selected: string[]) => void
    onSelectionChange?: (selected: string[]) => void
    placeholder?: string
    className?: string
}

export function MultiSelectFilter({
    options = [],
    selected,
    selectedValues,
    onChange,
    onSelectionChange,
    placeholder = "Filtre",
    className,
}: MultiSelectFilterProps) {
    const [open, setOpen] = React.useState(false)
    const safeSelected = selected ?? selectedValues ?? []
    const safeOptions = options ?? []
    const handleChange = onChange ?? onSelectionChange

    const toggleOption = (value: string) => {
        if (!handleChange) return
        handleChange(
            safeSelected.includes(value)
                ? safeSelected.filter((v) => v !== value)
                : [...safeSelected, value]
        )
    }

    return (
        <div className={cn("relative", className)}>
            <Button variant="outline" onClick={() => setOpen(!open)} className="w-full justify-between">
                {safeSelected.length > 0 ? `${safeSelected.length} seçili` : placeholder}
                <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            {open && (
                <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-background shadow-md">
                    {safeOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => toggleOption(option.value)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                        >
                            <div className={cn("h-4 w-4 rounded border flex items-center justify-center", safeSelected.includes(option.value) && "bg-primary border-primary")}>
                                {safeSelected.includes(option.value) && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// Export FilterOption as both names for backward compatibility
export type { FilterOption, FilterOption as Option, MultiSelectFilterProps }
