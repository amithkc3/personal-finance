import { Chart, ChartConfiguration, Colors } from 'chart.js/auto';

// Register the Colors plugin for default color palette
Chart.register(Colors);

// Helper to resolve CSS variables
function resolveColor(variable: string): string {
    const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
    // If variable not found/empty, return a reasonable default based on common Obsidian themes or fallback to gray
    return value && value.length > 0 ? value : '#888888';
}

export function createPieChart(
    canvas: HTMLCanvasElement,
    data: Map<string, number>,
    type: 'assets' | 'expenses' | 'liabilities' | 'income',
    currencySymbol: string
): Chart {
    const labels = Array.from(data.keys());
    const values = Array.from(data.values()).map(v => Math.abs(v));

    // High-contrast, distinguishable color palette
    const colors = [
        '#3b82f6', // bright blue
        '#ef4444', // bright red
        '#10b981', // emerald green
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#14b8a6', // teal
        '#f97316', // orange
        '#6366f1', // indigo
        '#84cc16', // lime
        '#06b6d4', // cyan
        '#d946ef', // fuchsia
    ];

    const textColor = resolveColor('--text-normal');
    const borderColor = resolveColor('--background-secondary');

    const config: ChartConfiguration = {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: borderColor // Use background color for gaps
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        padding: 6,
                        font: {
                            size: 10
                        },
                        boxWidth: 10,
                        boxHeight: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context: any) => {
                            const label = context.label || '';
                            const value = formatCurrency(context.parsed, currencySymbol);
                            return `${label}: ${value}`;
                        }
                    }
                }
            }
        }
    };

    return new Chart(canvas, config);
}


export function formatCurrency(amount: number, currencySymbol: string = '₹'): string {
    const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);

    return `${currencySymbol} ${formatted}`;
}

export interface SnapshotDataPoint {
    date: Date;
    netWorth: number;
    assets: number;
    liabilities: number;
}

export function createNetWorthLineChart(
    canvas: HTMLCanvasElement,
    snapshots: SnapshotDataPoint[],
    currencySymbol: string
): Chart {
    // Sort snapshots by date
    const sortedSnapshots = snapshots.sort((a, b) => a.date.getTime() - b.date.getTime());

    const labels = sortedSnapshots.map(s => s.date.toLocaleDateString());
    const netWorthData = sortedSnapshots.map(s => s.netWorth);
    const assetsData = sortedSnapshots.map(s => s.assets);
    const liabilitiesData = sortedSnapshots.map(s => s.liabilities);

    const textColor = resolveColor('--text-muted');
    const gridColor = resolveColor('--background-modifier-border');
    // Using hex directly for lines to ensure visibility/consistency across themes, referencing newly added CSS var could be an option but these standard colors work well
    const labelColor = resolveColor('--text-normal');

    const config: ChartConfiguration = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Net Worth',
                    data: netWorthData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Total Assets',
                    data: assetsData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: 'Total Liabilities',
                    data: liabilitiesData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: labelColor,
                        padding: 15,
                        font: {
                            size: 13,
                            weight: 600
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context: any) => {
                            const label = context.dataset.label || '';
                            const value = formatCurrency(context.parsed.y, currencySymbol);
                            return `${label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: textColor,
                        callback: function (value: any) {
                            return formatCurrency(value, currencySymbol);
                        }
                    },
                    grid: {
                        color: gridColor
                    }
                },
                x: {
                    ticks: {
                        color: textColor,
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: gridColor
                    }
                }
            }
        }
    };

    return new Chart(canvas, config);
}
