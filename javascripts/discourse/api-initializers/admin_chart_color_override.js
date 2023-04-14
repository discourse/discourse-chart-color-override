import { apiInitializer } from "discourse/lib/api";
import { makeArray } from "discourse-common/lib/helpers";
import Report from "admin/models/report";
import loadScript from "discourse/lib/load-script";

export default apiInitializer("0.11.1", (api) => {
  api.modifyClass("component:admin-report-stacked-chart", {
    pluginId: "discourse-chart-color-override",

    // overrides the core method to use custom colors from the theme setting

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
            data: Report.collapse(model, cd.data),
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
});
