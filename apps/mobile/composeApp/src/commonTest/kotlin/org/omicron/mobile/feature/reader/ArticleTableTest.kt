package org.omicron.mobile.feature.reader

import androidx.compose.ui.unit.dp
import org.omicron.mobile.core.article.ArticleBlock
import org.omicron.mobile.core.article.ArticleSpan
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ArticleTableTest {
    @Test
    fun countsColumnsFromWidestRow() {
        val block =
            ArticleBlock.Table(
                headers = listOf(cell("A")),
                rows = listOf(listOf(cell("1"), cell("2"), cell("3"))),
            )

        assertEquals(3, tableColumnCount(block))
    }

    @Test
    fun fitsNarrowTablesWithoutScrolling() {
        assertNull(tableCellWidth(columnCount = 2, maxWidth = 360.dp))
    }

    @Test
    fun scrollsWideTablesAtMinimumCellWidth() {
        assertEquals(120.dp, tableCellWidth(columnCount = 4, maxWidth = 360.dp))
    }

    @Test
    fun treatsEmptyTablesAsZeroColumns() {
        assertEquals(0, tableColumnCount(ArticleBlock.Table(emptyList(), emptyList())))
        assertNull(tableCellWidth(columnCount = 0, maxWidth = 360.dp))
    }

    private fun cell(text: String) = listOf(ArticleSpan(text))
}
