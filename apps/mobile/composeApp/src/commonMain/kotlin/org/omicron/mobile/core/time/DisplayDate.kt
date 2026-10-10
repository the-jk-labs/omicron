package org.omicron.mobile.core.time

import androidx.compose.runtime.Composable
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.timeline_date_format
import org.omicron.mobile.resources.timeline_month_apr
import org.omicron.mobile.resources.timeline_month_aug
import org.omicron.mobile.resources.timeline_month_dec
import org.omicron.mobile.resources.timeline_month_feb
import org.omicron.mobile.resources.timeline_month_jan
import org.omicron.mobile.resources.timeline_month_jul
import org.omicron.mobile.resources.timeline_month_jun
import org.omicron.mobile.resources.timeline_month_mar
import org.omicron.mobile.resources.timeline_month_may
import org.omicron.mobile.resources.timeline_month_nov
import org.omicron.mobile.resources.timeline_month_oct
import org.omicron.mobile.resources.timeline_month_sep

@Composable
fun displayDate(isoDate: String): String {
    val dateParts = isoDate.take(10).split('-')
    val year = dateParts.getOrNull(0)?.toIntOrNull() ?: return isoDate.take(10)
    val month = dateParts.getOrNull(1)?.toIntOrNull() ?: return isoDate.take(10)
    val day = dateParts.getOrNull(2)?.toIntOrNull() ?: return isoDate.take(10)
    val monthResource = DISPLAY_MONTHS.getOrNull(month - 1) ?: return isoDate.take(10)
    return stringResource(Res.string.timeline_date_format, stringResource(monthResource), day, year)
}

private val DISPLAY_MONTHS =
    listOf(
        Res.string.timeline_month_jan,
        Res.string.timeline_month_feb,
        Res.string.timeline_month_mar,
        Res.string.timeline_month_apr,
        Res.string.timeline_month_may,
        Res.string.timeline_month_jun,
        Res.string.timeline_month_jul,
        Res.string.timeline_month_aug,
        Res.string.timeline_month_sep,
        Res.string.timeline_month_oct,
        Res.string.timeline_month_nov,
        Res.string.timeline_month_dec,
    )
