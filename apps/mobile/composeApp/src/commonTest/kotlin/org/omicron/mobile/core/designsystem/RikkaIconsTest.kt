package org.omicron.mobile.core.designsystem

import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathNode
import androidx.compose.ui.graphics.vector.VectorPath
import org.junit.Assert.assertEquals
import org.junit.Test
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons

class RikkaIconsTest {
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
                PathNode.MoveTo(5f, 3f),
                PathNode.MoveTo(8f, 2f),
                PathNode.MoveTo(16f, 2f),
                PathNode.MoveTo(3f, 9f),
            ),
            firstPathNodes(RikkaIcons.Calendar),
        )
    }

    @Test
    fun languagesIconFollowsTheLucideOutline() {
        assertEquals(
            listOf(
                PathNode.MoveTo(5f, 8f),
                PathNode.MoveTo(4f, 14f),
                PathNode.MoveTo(2f, 5f),
                PathNode.MoveTo(7f, 2f),
                PathNode.MoveTo(22f, 22f),
                PathNode.MoveTo(14f, 18f),
            ),
            firstPathNodes(RikkaIcons.Languages),
        )
    }

    private fun firstPathNodes(icon: ImageVector): List<PathNode> {
        val childrenField = icon.root.javaClass.getDeclaredField("children").apply { isAccessible = true }
        return (childrenField.get(icon.root) as List<*>).filterIsInstance<VectorPath>().map { it.pathData.first() }
    }
}
