import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export type ReportKind = "daily" | "weekly" | "monthly";
export type ReportNavigationProps = {
    kind: ReportKind;
    onKindChange: (kind: ReportKind) => void;
    value: string;
    date?: string;
    onChange: (value: string) => void;
};

const KINDS: { kind: ReportKind; label: string }[] = [
    { kind: "daily", label: "日报" },
    { kind: "weekly", label: "周报" },
    { kind: "monthly", label: "月报" },
];

function dateString(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

// ISO 周以周一开始，第一周必须包含 1 月 4 日，跨年日期不能直接拼接自然年。
export function reportPeriodForDate(date: Date, kind: ReportKind): string {
    if (kind === "daily") return dateString(date);
    if (kind === "monthly") return dateString(date).slice(0, 7);
    const thursday = new Date(date);
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
    const year = thursday.getUTCFullYear();
    const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
}

function selectedDate({ kind, value, date }: ReportNavigationProps): Date {
    if (kind === "weekly" && /^\d{4}-W\d{2}$/.test(value)) {
        const [year, week] = value.split("-W").map(Number);
        const start = new Date(Date.UTC(year, 0, 4));
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + (week - 1) * 7);
        return start;
    }
    const source = kind === "monthly" && value ? `${value}-01` : value || date;
    const parsed = source ? new Date(`${source.slice(0, 10)}T00:00:00Z`) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function ReportNavigation({ kind, onKindChange, value, onChange }: ReportNavigationProps) {
    const field = kind === "daily" ? "date" : kind === "weekly" ? "week" : "month";
    return (
        <div className="news-report-navigation">
            <div className="news-report-switch" role="group" aria-label="期刊类型">
                {KINDS.map((item) => (
                    <button key={item.kind} type="button" aria-pressed={kind === item.kind} onClick={() => onKindChange(item.kind)}>
                        {item.label}
                    </button>
                ))}
            </div>
            <span className="news-editorial-eyebrow">往期阅读</span>
            <label htmlFor="news-report-period">选择{kind === "daily" ? "日期" : kind === "weekly" ? "周次" : "月份"}</label>
            <input id="news-report-period" type={field} value={value} onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="news-edition-current" onClick={() => onChange("")}>
                回到最新一期
            </button>
        </div>
    );
}

export function ReportCalendar(props: ReportNavigationProps) {
    const selected = selectedDate(props);
    const selectedKey = dateString(selected);
    const [month, setMonth] = useState(selectedKey.slice(0, 7));
    useEffect(() => setMonth(selectedKey.slice(0, 7)), [selectedKey]);
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthNumber - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const moveMonth = (step: number) => setMonth(dateString(new Date(Date.UTC(year, monthNumber - 1 + step, 1))).slice(0, 7));
    return (
        <section className="news-report-calendar" aria-label="期刊日历" data-kind={props.kind}>
            <div className="news-report-calendar-date">
                <span>{props.kind === "daily" ? "本期日期" : props.kind === "weekly" ? "本周起始" : "本期月份"}</span>
                <strong>{props.kind === "monthly" ? selected.getUTCMonth() + 1 : selected.getUTCDate()}</strong>
                <span>
                    {selected.getUTCFullYear()} 年 {selected.getUTCMonth() + 1} 月
                </span>
                <small>{props.kind === "monthly" ? "月报" : `星期${["日", "一", "二", "三", "四", "五", "六"][selected.getUTCDay()]}`}</small>
            </div>
            <div className="news-report-calendar-month">
                <header>
                    <button type="button" aria-label="上个月" onClick={() => moveMonth(-1)}>
                        <ChevronLeft aria-hidden />
                    </button>
                    <span>
                        {year} 年 {monthNumber} 月
                    </span>
                    <button type="button" aria-label="下个月" disabled={month >= today.slice(0, 7)} onClick={() => moveMonth(1)}>
                        <ChevronRight aria-hidden />
                    </button>
                </header>
                <div className="news-report-calendar-grid">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                        <span key={day}>{day}</span>
                    ))}
                    {Array.from({ length: offset }, (_, i) => (
                        <span key={`blank-${i}`} aria-hidden />
                    ))}
                    {Array.from({ length: days }, (_, i) => {
                        const day = new Date(Date.UTC(year, monthNumber - 1, i + 1));
                        const key = dateString(day);
                        const period = reportPeriodForDate(day, props.kind);
                        const active = period === reportPeriodForDate(selected, props.kind);
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-label={`${key} ${props.kind === "daily" ? "日报" : props.kind === "weekly" ? "所在周周报" : "所在月月报"}`}
                                aria-pressed={active}
                                aria-current={key === today ? "date" : undefined}
                                disabled={key > today}
                                onClick={() => props.onChange(period)}
                            >
                                {i + 1}
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
