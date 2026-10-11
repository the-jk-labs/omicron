package org.omicron.mobile.core.designsystem

import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.PathNode
import androidx.compose.ui.graphics.vector.VectorPath
import org.junit.Assert.assertEquals
import org.junit.Test
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons

class RikkaIconsTest {
    @Test
    fun homeIconUsesTheWebHousePaths() {
        assertEquals(
            listOf(
                path("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"),
                path("M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
            ),
            paths(RikkaIcons.Home),
        )
    }

    @Test
    fun statsIconUsesTheWebChartColumnPaths() {
        assertEquals(
            listOf(
                path("M3 3v16a2 2 0 0 0 2 2h16"),
                path("M18 17V9"),
                path("M13 17V5"),
                path("M8 17v-3"),
            ),
            paths(RikkaIcons.ChartColumn),
        )
    }

    @Test
    fun recommendationIconUsesTheWebRepeat2Paths() {
        assertEquals(
            listOf(
                path("m2 9 3-3 3 3"),
                path("M13 18H7a2 2 0 0 1-2-2V6"),
                path("m22 15-3 3-3-3"),
                path("M11 6h6a2 2 0 0 1 2 2v10"),
            ),
            paths(RikkaIcons.Recommend),
        )
    }

    @Test
    fun usersIconStartsWithTheWebLucideSilhouette() {
        assertEquals(
            listOf(
                PathNode.MoveTo(16f, 21f),
                PathNode.MoveTo(16f, 3.128f),
                PathNode.MoveTo(22f, 21f),
                PathNode.MoveTo(13f, 7f),
            ),
            firstPathNodes(RikkaIcons.Users),
        )
    }

    @Test
    fun calendarIconFollowsTheLucideOutline() {
        assertEquals(
            listOf(
                path("M8 2v3"),
                path("M16 2v3"),
                path("M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"),
                path("M3 9h18"),
            ),
            paths(RikkaIcons.Calendar),
        )
    }

    @Test
    fun languagesIconFollowsTheLucideOutline() {
        assertEquals(
            listOf(
                path("m5 8 6 6"),
                path("m4 14 6-6 2-3"),
                path("M2 5h12"),
                path("M7 2h1"),
                path("m22 22-5-10-5 10"),
                path("M14 18h6"),
            ),
            paths(RikkaIcons.Languages),
        )
    }

    private fun paths(icon: ImageVector): List<List<PathNode>> {
        val childrenField = icon.root.javaClass.getDeclaredField("children").apply { isAccessible = true }
        return (childrenField.get(icon.root) as List<*>).filterIsInstance<VectorPath>().map { it.pathData }
    }

    private fun firstPathNodes(icon: ImageVector): List<PathNode> = paths(icon).map { it.first() }

    private fun path(data: String): List<PathNode> = PathParser().parsePathString(data).toNodes()
}
