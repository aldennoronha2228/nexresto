import jsPDF from 'jspdf';

export interface DailyReport {
    id: string;
    restaurant_id: string;
    report_date: string;
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
    top_items: { name: string; quantity: number; revenue: number }[];
    hourly_breakdown: Record<string, number>;
    busiest_hour: number | null;
    cancelled_orders: number;
    generated_at: string;
}

/**
 * Generate a professional, branded PDF report
 * Design: Clean, minimalist like a bank statement
 */
export function generateReportPDF(
    report: DailyReport,
    restaurantName: string
): jsPDF {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Colors
    const primaryColor: [number, number, number] = [37, 99, 235]; // Blue-600
    const textDark: [number, number, number] = [15, 23, 42]; // Slate-900
    const textMuted: [number, number, number] = [100, 116, 139]; // Slate-500
    const borderColor: [number, number, number] = [226, 232, 240]; // Slate-200

    // ─── Header Section ─────────────────────────────────────────────────────────

    // Brand bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Restaurant name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(restaurantName, margin, 18);

    // Report title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Daily Sales Report', margin, 28);

    // Date
    const reportDate = new Date(report.report_date);
    const formattedDate = reportDate.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    doc.setFontSize(10);
    doc.text(formattedDate, pageWidth - margin - doc.getTextWidth(formattedDate), 28);

    y = 55;

    // ─── Summary Cards ──────────────────────────────────────────────────────────

    doc.setTextColor(...textMuted);
    doc.setFontSize(9);
    doc.text('DAILY SUMMARY', margin, y);
    y += 8;

    // Summary box
    const boxY = y;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, boxY, pageWidth - margin * 2, 45, 3, 3, 'S');

    // Grid: 4 columns
    const colWidth = (pageWidth - margin * 2) / 4;

    const summaryItems = [
        { label: 'Total Revenue', value: `₹${report.total_revenue.toLocaleString('en-IN')}` },
        { label: 'Total Orders', value: report.total_orders.toString() },
        { label: 'Avg Order Value', value: `₹${report.avg_order_value.toFixed(0)}` },
        { label: 'Cancelled', value: report.cancelled_orders.toString() },
    ];

    summaryItems.forEach((item, i) => {
        const x = margin + colWidth * i + colWidth / 2;

        // Value
        doc.setTextColor(...textDark);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(item.value, x, boxY + 20, { align: 'center' });

        // Label
        doc.setTextColor(...textMuted);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label.toUpperCase(), x, boxY + 30, { align: 'center' });

        // Divider (except last)
        if (i < 3) {
            doc.setDrawColor(...borderColor);
            doc.line(margin + colWidth * (i + 1), boxY + 8, margin + colWidth * (i + 1), boxY + 37);
        }
    });

    y = boxY + 55;

    // ─── Busiest Hour ───────────────────────────────────────────────────────────

    if (report.busiest_hour !== null) {
        doc.setTextColor(...textMuted);
        doc.setFontSize(9);
        doc.text('PEAK BUSINESS HOUR', margin, y);
        y += 8;

        const hour = report.busiest_hour;
        const hourLabel = hour === 0 ? '12 AM' :
            hour < 12 ? `${hour} AM` :
                hour === 12 ? '12 PM' :
                    `${hour - 12} PM`;
        const orderCount = report.hourly_breakdown[hour.toString()] || 0;

        doc.setFillColor(248, 250, 252); // Slate-50
        doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 3, 3, 'F');

        doc.setTextColor(...textDark);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(hourLabel, margin + 10, y + 14);

        doc.setTextColor(...textMuted);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`${orderCount} orders received during this hour`, margin + 50, y + 14);

        y += 32;
    }

    // ─── Top Selling Items ──────────────────────────────────────────────────────

    if (report.top_items && report.top_items.length > 0) {
        doc.setTextColor(...textMuted);
        doc.setFontSize(9);
        doc.text('TOP SELLING ITEMS', margin, y);
        y += 8;

        // Table header
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');

        doc.setTextColor(...textMuted);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('#', margin + 8, y + 7);
        doc.text('ITEM NAME', margin + 20, y + 7);
        doc.text('QTY', pageWidth - margin - 70, y + 7, { align: 'center' });
        doc.text('REVENUE', pageWidth - margin - 20, y + 7, { align: 'right' });

        y += 12;

        // Table rows
        report.top_items.forEach((item, i) => {
            const rowY = y + i * 12;

            // Alternating row background
            if (i % 2 === 0) {
                doc.setFillColor(255, 255, 255);
            } else {
                doc.setFillColor(252, 252, 253);
            }
            doc.rect(margin, rowY - 4, pageWidth - margin * 2, 12, 'F');

            // Rank badge colors: Gold, Silver, Bronze, Gray
            const badgeColors: [number, number, number][] = [
                [234, 179, 8],   // Gold
                [148, 163, 184], // Silver
                [180, 83, 9],    // Bronze
                [203, 213, 225], // Gray
            ];
            const badgeColor = badgeColors[Math.min(i, 3)];
            doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
            doc.circle(margin + 8, rowY + 2, 3, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text((i + 1).toString(), margin + 8, rowY + 4, { align: 'center' });

            // Item name
            doc.setTextColor(...textDark);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(item.name.substring(0, 30), margin + 20, rowY + 4);

            // Quantity
            doc.setTextColor(...textMuted);
            doc.setFontSize(9);
            doc.text(item.quantity.toString(), pageWidth - margin - 70, rowY + 4, { align: 'center' });

            // Revenue
            doc.setTextColor(...textDark);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`₹${item.revenue.toLocaleString('en-IN')}`, pageWidth - margin - 8, rowY + 4, { align: 'right' });
        });

        y += report.top_items.length * 12 + 10;
    }

    // ─── Hourly Distribution Chart ──────────────────────────────────────────────

    if (Object.keys(report.hourly_breakdown).length > 0) {
        y += 5;
        doc.setTextColor(...textMuted);
        doc.setFontSize(9);
        doc.text('ORDERS BY HOUR', margin, y);
        y += 10;

        const chartWidth = pageWidth - margin * 2;
        const chartHeight = 40;
        const hours = Object.entries(report.hourly_breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        const maxOrders = Math.max(...hours.map(([, v]) => v));

        // Chart background
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, chartWidth, chartHeight + 15, 3, 3, 'F');

        // Bars
        hours.forEach(([hour, count], i) => {
            const barWidth = 8;
            const gap = (chartWidth - hours.length * barWidth) / (hours.length + 1);
            const x = margin + gap + i * (barWidth + gap);
            const barHeight = (count / maxOrders) * chartHeight;

            // Bar
            doc.setFillColor(...primaryColor);
            doc.roundedRect(x, y + chartHeight - barHeight + 5, barWidth, barHeight, 1, 1, 'F');

            // Hour label
            doc.setTextColor(...textMuted);
            doc.setFontSize(6);
            const hourNum = parseInt(hour);
            const label = hourNum === 0 ? '12a' : hourNum < 12 ? `${hourNum}a` : hourNum === 12 ? '12p' : `${hourNum - 12}p`;
            doc.text(label, x + barWidth / 2, y + chartHeight + 12, { align: 'center' });
        });

        y += chartHeight + 25;
    }

    // ─── Footer ─────────────────────────────────────────────────────────────────

    const footerY = doc.internal.pageSize.getHeight() - 15;

    doc.setDrawColor(...borderColor);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    doc.setTextColor(...textMuted);
    doc.setFontSize(8);
    doc.text(
        `Generated on ${new Date(report.generated_at).toLocaleDateString('en-IN')} at ${new Date(report.generated_at).toLocaleTimeString('en-IN')}`,
        margin,
        footerY
    );
    doc.text('Powered by NexResto', pageWidth - margin, footerY, { align: 'right' });

    return doc;
}

/**
 * Download the PDF report
 */
export function downloadReportPDF(
    report: DailyReport,
    restaurantName: string
) {
    const doc = generateReportPDF(report, restaurantName);
    const fileName = `${restaurantName.replace(/\s+/g, '_')}_Report_${report.report_date}.pdf`;
    doc.save(fileName);
}

/**
 * Generate a weekly summary PDF
 */
export function generateWeeklySummaryPDF(
    reports: DailyReport[],
    restaurantName: string,
    weekStart: string,
    weekEnd: string
): jsPDF {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    const primaryColor: [number, number, number] = [37, 99, 235];
    const textDark: [number, number, number] = [15, 23, 42];
    const textMuted: [number, number, number] = [100, 116, 139];
    const borderColor: [number, number, number] = [226, 232, 240];

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(restaurantName, margin, 18);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Weekly Sales Report', margin, 28);

    doc.setFontSize(10);
    doc.text(`${weekStart} → ${weekEnd}`, pageWidth - margin - doc.getTextWidth(`${weekStart} → ${weekEnd}`), 28);

    y = 55;

    // Weekly totals
    const totalRevenue = reports.reduce((sum, r) => sum + r.total_revenue, 0);
    const totalOrders = reports.reduce((sum, r) => sum + r.total_orders, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalCancelled = reports.reduce((sum, r) => sum + r.cancelled_orders, 0);

    doc.setTextColor(...textMuted);
    doc.setFontSize(9);
    doc.text('WEEKLY TOTALS', margin, y);
    y += 8;

    const boxY = y;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, boxY, pageWidth - margin * 2, 45, 3, 3, 'S');

    const colWidth = (pageWidth - margin * 2) / 4;
    const summaryItems = [
        { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}` },
        { label: 'Total Orders', value: totalOrders.toString() },
        { label: 'Avg Order Value', value: `₹${avgOrderValue.toFixed(0)}` },
        { label: 'Days Reported', value: reports.length.toString() },
    ];

    summaryItems.forEach((item, i) => {
        const x = margin + colWidth * i + colWidth / 2;

        doc.setTextColor(...textDark);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(item.value, x, boxY + 20, { align: 'center' });

        doc.setTextColor(...textMuted);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label.toUpperCase(), x, boxY + 30, { align: 'center' });

        if (i < 3) {
            doc.setDrawColor(...borderColor);
            doc.line(margin + colWidth * (i + 1), boxY + 8, margin + colWidth * (i + 1), boxY + 37);
        }
    });

    y = boxY + 55;

    // Daily breakdown table
    doc.setTextColor(...textMuted);
    doc.setFontSize(9);
    doc.text('DAILY BREAKDOWN', margin, y);
    y += 8;

    // Table header
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');

    doc.setTextColor(...textMuted);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('DATE', margin + 8, y + 7);
    doc.text('ORDERS', margin + 70, y + 7);
    doc.text('REVENUE', margin + 110, y + 7);
    doc.text('AVG ORDER', pageWidth - margin - 20, y + 7, { align: 'right' });

    y += 12;

    reports.sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());

    reports.forEach((report, i) => {
        const rowY = y + i * 10;

        if (i % 2 === 1) {
            doc.setFillColor(252, 252, 253);
            doc.rect(margin, rowY - 3, pageWidth - margin * 2, 10, 'F');
        }

        const date = new Date(report.report_date);
        const dateStr = date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

        doc.setTextColor(...textDark);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(dateStr, margin + 8, rowY + 4);
        doc.text(report.total_orders.toString(), margin + 70, rowY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(`₹${report.total_revenue.toLocaleString('en-IN')}`, margin + 110, rowY + 4);
        doc.setFont('helvetica', 'normal');
        doc.text(`₹${report.avg_order_value.toFixed(0)}`, pageWidth - margin - 20, rowY + 4, { align: 'right' });
    });

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setDrawColor(...borderColor);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    doc.setTextColor(...textMuted);
    doc.setFontSize(8);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, margin, footerY);
    doc.text('Powered by NexResto', pageWidth - margin, footerY, { align: 'right' });

    return doc;
}
