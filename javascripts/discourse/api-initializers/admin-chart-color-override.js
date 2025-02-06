import { apiInitializer } from "discourse/lib/api";
import { makeArray } from "discourse/lib/helpers";
import loadScript from "discourse/lib/load-script";

export default apiInitializer("0.11.1", (api) => {
  const user = api.getCurrentUser();

  // need to include a couple functions since I can't import admin/models/report

  const DAILY_LIMIT_DAYS = 34;
  const WEEKLY_LIMIT_DAYS = 365;

  function groupingForDatapoints(count) {
    if (count < DAILY_LIMIT_DAYS) {
      return "daily";
    }

    if (count >= DAILY_LIMIT_DAYS && count < WEEKLY_LIMIT_DAYS) {
      return "weekly";
    }

    if (count >= WEEKLY_LIMIT_DAYS) {
      return "monthly";
    }
  }

  function applyAverage(value, start, end) {
    const count = end.diff(start, "day") + 1; // 1 to include start
    return parseFloat((value / count).toFixed(2));
  }

  function collapseChartData(model, data) {
    let grouping = groupingForDatapoints(data.length);

    if (grouping === "daily") {
      return data;
    } else if (grouping === "weekly" || grouping === "monthly") {
      const isoKind = grouping === "weekly" ? "isoWeek" : "month";
      const kind = grouping === "weekly" ? "week" : "month";
      const startMoment = moment(model.start_date, "YYYY-MM-DD");

      let currentIndex = 0;
      let currentStart = startMoment.clone().startOf(isoKind);
      let currentEnd = startMoment.clone().endOf(isoKind);
      const transformedData = [
        {
          x: currentStart.format("YYYY-MM-DD"),
          y: 0,
        },
      ];

      let appliedAverage = false;
      data.forEach((d) => {
        const date = moment(d.x, "YYYY-MM-DD");

        if (
          !date.isSame(currentStart) &&
          !date.isBetween(currentStart, currentEnd)
        ) {
          if (model.average) {
            transformedData[currentIndex].y = applyAverage(
              transformedData[currentIndex].y,
              currentStart,
              currentEnd
            );

            appliedAverage = true;
          }

          currentIndex += 1;
          currentStart = currentStart.add(1, kind).startOf(isoKind);
          currentEnd = currentEnd.add(1, kind).endOf(isoKind);
        } else {
          appliedAverage = false;
        }

        if (transformedData[currentIndex]) {
          transformedData[currentIndex].y += d.y;
        } else {
          transformedData[currentIndex] = {
            x: d.x,
            y: d.y,
          };
        }
      });

      if (model.average && !appliedAverage) {
        transformedData[currentIndex].y = applyAverage(
          transformedData[currentIndex].y,
          currentStart,
          moment(model.end_date).subtract(1, "day") // remove 1 day as model end date is at 00:00 of next day
        );
      }

      return transformedData;
    }

    // ensure we return something if grouping is unknown
    return data;
  }

  if (user?.admin) {
    api.modifyClass("component:admin-report-stacked-chart", {
      pluginId: "discourse-chart-color-override",

      _renderChart(model, chartCanvas) {
        if (!chartCanvas) {
          return;
        }

        const context = chartCanvas.getContext("2d");

        const alternativeColors = settings.chart_colors
          .split("|")
          .map((color) => "#" + color);

        const chartData = makeArray(model.chartData || model.data).map(
          (cd, index) => {
            const color =
              alternativeColors[index % alternativeColors.length] || cd.color;

            return {
              label: cd.label,
              color,
              data: collapseChartData(model, cd.data),
            };
          }
        );
        const data = {
          labels: chartData[0].data.mapBy("x"),
          datasets: chartData.map((cd) => {
            return {
              label: cd.label,
              stack: "pageviews-stack",
              data: cd.data,
              backgroundColor: cd.color,
            };
          }),
        };

        loadScript("/javascripts/Chart.min.js").then(() => {
          this._resetChart();

          this._chart = new window.Chart(context, this._buildChartConfig(data));
        });
      },
    });
  }
});
