package org.omicron.mobile.core.designsystem

import androidx.compose.ui.graphics.vector.PathNode
import androidx.compose.ui.graphics.vector.VectorPath
import org.junit.Assert.assertEquals
import org.junit.Test
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons

class RikkaIconsTest {
    @Test
    fun usersIconStartsWithTheWebLucideSilhouette() {
        val root = RikkaIcons.Users.root
        val childrenField = root.javaClass.getDeclaredField("children").apply { isAccessible = true }
        val paths = (childrenField.get(root) as List<*>).filterIsInstance<VectorPath>()

        assertEquals(
            listOf(
                PathNode.MoveTo(16f, 21f),
                PathNode.MoveTo(16f, 3.128f),
                PathNode.MoveTo(22f, 21f),
                PathNode.MoveTo(13f, 7f),
            ),
            paths.map { it.pathData.first() },
        )
    }
}
