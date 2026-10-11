package org.omicron.mobile.core.designsystem.rikkaui.icon

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

// ─── Icon Library ───────────────────────────────────────────

public object RikkaIcons {
    // ── Shared builder helpers ──────────────────────────────

    private fun lucideSvgIcon(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            paths.forEach { data ->
                addPath(
                    pathData = PathParser().parsePathString(data).toNodes(),
                    fill = SolidColor(Color.Transparent),
                    fillAlpha = 0f,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()

    // ── Chevrons ────────────────────────────────────────────

    public val ChevronRight: ImageVector by lazy {
        lucideSvgIcon("ChevronRight", "m9 18 6-6-6-6")
    }

    public val ChevronDown: ImageVector by lazy {
        lucideSvgIcon("ChevronDown", "m6 9 6 6 6-6")
    }

    public val ChevronLeft: ImageVector by lazy {
        lucideSvgIcon("ChevronLeft", "m15 18-6-6 6-6")
    }

    public val ChevronUp: ImageVector by lazy {
        lucideSvgIcon("ChevronUp", "m18 15-6-6-6 6")
    }

    // ── Actions ─────────────────────────────────────────────

    public val Check: ImageVector by lazy {
        lucideSvgIcon("Check", "M20 6 9 17l-5-5")
    }

    public val X: ImageVector by lazy {
        lucideSvgIcon("X", "M18 6 6 18", "m6 6 12 12")
    }

    public val Plus: ImageVector by lazy {
        lucideSvgIcon("Plus", "M5 12h14", "M12 5v14")
    }

    public val Minus: ImageVector by lazy {
        lucideSvgIcon("Minus", "M5 12h14")
    }

    // ── Search ──────────────────────────────────────────────

    public val Search: ImageVector by lazy {
        lucideSvgIcon("Search", "m21 21-4.34-4.34", "M19 11a8 8 0 1 1-16 0a8 8 0 1 1 16 0")
    }

    public val Home: ImageVector by lazy {
        lucideSvgIcon("House", "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")
    }

    public val Library: ImageVector by lazy {
        lucideSvgIcon("Library", "m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16")
    }

    public val ChartColumn: ImageVector by lazy {
        lucideSvgIcon("ChartColumn", "M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3")
    }

    public val Bell: ImageVector by lazy {
        lucideSvgIcon("Bell", "M10.268 21a2 2 0 0 0 3.464 0", "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326")
    }

    public val Sparkles: ImageVector by lazy {
        lucideSvgIcon("Sparkles", "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z", "M20 2v4", "M22 4h-4", "M6 20a2 2 0 1 1-4 0a2 2 0 1 1 4 0")
    }

    public val LogOut: ImageVector by lazy {
        lucideSvgIcon("LogOut", "m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4")
    }

    public val FileStack: ImageVector by lazy {
        lucideSvgIcon("FileStack", "M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1", "M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1", "M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z")
    }

    public val Globe: ImageVector by lazy {
        lucideSvgIcon("Globe", "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20")
    }

    public val Calendar: ImageVector by lazy {
        lucideSvgIcon("Calendar", "M8 2v3", "M16 2v3", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18")
    }

    public val Languages: ImageVector by lazy {
        lucideSvgIcon("Languages", "m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6")
    }

    public val Users: ImageVector by lazy {
        lucideSvgIcon("Users", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0")
    }

    public val VolumeX: ImageVector by lazy {
        lucideSvgIcon("VolumeX", "M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z", "m16.5 14.5 5-5", "m16.5 9.5 5 5")
    }

    public val Ban: ImageVector by lazy {
        lucideSvgIcon("Ban", "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M4.929 4.929 19.07 19.071")
    }

    public val Lock: ImageVector by lazy {
        lucideSvgIcon("Lock", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4")
    }

    // ── Arrows ──────────────────────────────────────────────

    public val ArrowLeft: ImageVector by lazy {
        lucideSvgIcon("ArrowLeft", "m12 19-7-7 7-7", "M19 12H5")
    }

    public val ArrowRight: ImageVector by lazy {
        lucideSvgIcon("ArrowRight", "M5 12h14", "m12 5 7 7-7 7")
    }

    public val ArrowUp: ImageVector by lazy {
        lucideSvgIcon("ArrowUp", "m5 12 7-7 7 7", "M12 19V5")
    }

    public val ArrowDown: ImageVector by lazy {
        lucideSvgIcon("ArrowDown", "M12 5v14", "m19 12-7 7-7-7")
    }

    // ── Menu / More ─────────────────────────────────────────

    public val Menu: ImageVector by lazy {
        lucideSvgIcon("Menu", "M4 5h16", "M4 12h16", "M4 19h16")
    }

    public val MoreHorizontal: ImageVector by lazy {
        lucideSvgIcon("Ellipsis", "M13 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0", "M20 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0", "M6 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0")
    }

    public val MoreVertical: ImageVector by lazy {
        lucideSvgIcon("EllipsisVertical", "M13 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0", "M13 5a1 1 0 1 1-2 0a1 1 0 1 1 2 0", "M13 19a1 1 0 1 1-2 0a1 1 0 1 1 2 0")
    }

    // ── Communication ───────────────────────────────────────

    public val Mail: ImageVector by lazy {
        lucideSvgIcon("Mail", "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7", "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z")
    }

    public val Send: ImageVector by lazy {
        lucideSvgIcon("Send", "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z", "m21.854 2.147-10.94 10.939")
    }

    // ── People ──────────────────────────────────────────────

    public val User: ImageVector by lazy {
        lucideSvgIcon("User", "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0")
    }

    // ── Feedback / Social ───────────────────────────────────

    public val Heart: ImageVector by lazy {
        lucideSvgIcon("Heart", "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5")
    }

    public val Clock: ImageVector by lazy {
        lucideSvgIcon("Clock", "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M12 6v6l4 2")
    }

    public val MessageCircle: ImageVector by lazy {
        lucideSvgIcon("MessageCircle", "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719")
    }

    public val Recommend: ImageVector by lazy {
        lucideSvgIcon("Repeat2", "m2 9 3-3 3 3", "M13 18H7a2 2 0 0 1-2-2V6", "m22 15-3 3-3-3", "M11 6h6a2 2 0 0 1 2 2v10")
    }

    public val Bookmark: ImageVector by lazy {
        lucideSvgIcon("Bookmark", "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z")
    }

    public val Star: ImageVector by lazy {
        lucideSvgIcon("Star", "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z")
    }

    // ── Visibility ──────────────────────────────────────────

    public val Eye: ImageVector by lazy {
        lucideSvgIcon("Eye", "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0")
    }

    // ── Editing ─────────────────────────────────────────────

    public val Copy: ImageVector by lazy {
        lucideSvgIcon("Copy", "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2")
    }

    public val Trash: ImageVector by lazy {
        lucideSvgIcon("Trash", "M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
    }

    public val Edit: ImageVector by lazy {
        lucideSvgIcon("Pencil", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4")
    }

    public val PenLine: ImageVector by lazy {
        lucideSvgIcon("PenLine", "M13 21h8", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z")
    }

    // ── File transfer ───────────────────────────────────────

    public val Download: ImageVector by lazy {
        lucideSvgIcon("Download", "M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5")
    }

    public val Upload: ImageVector by lazy {
        lucideSvgIcon("Upload", "M12 3v12", "m17 8-5-5-5 5", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4")
    }

    // ── Theme ───────────────────────────────────────────────

    public val Sun: ImageVector by lazy {
        lucideSvgIcon("Sun", "M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41-1.41")
    }

    public val Moon: ImageVector by lazy {
        lucideSvgIcon("Moon", "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401")
    }

    // ── Settings ────────────────────────────────────────────

    public val Settings: ImageVector by lazy {
        lucideSvgIcon("Settings", "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915", "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0")
    }
}
