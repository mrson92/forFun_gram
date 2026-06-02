# Log Analyzer

A high-performance web-based Log Analyzer application built with React, TypeScript, and Vite. This tool allows users to upload various log files, process them efficiently, identify performance bottlenecks (slow requests), and visualize key metrics.

## Features

*   **Log File Upload & Processing:** Supports uploading large `.log` or `.txt` files with efficient chunk-based processing.
*   **Multiple Log Formats:**
    *   **MyBatis (SQL Logback):** Analyzes SQL query execution times.
    *   **Nginx Access Logs:** Processes Nginx web server access logs.
    *   **Tomcat Access Logs:** Analyzes Tomcat application server access logs.
    *   **Logback Application Logs:** Generic application log processing.
*   **Performance Monitoring:**
    *   Identifies requests with response times exceeding 200ms.
    *   Calculates total requests, unique IPs, unique APIs/queries, and error rates.
    *   Provides average response time.
*   **Data Visualization:**
    *   **Time-series Traffic (TPS/QPS) Chart:** Visualizes requests per second/query per second over time using Recharts.
    *   **Response Time Distribution Heatmap:** Displays the distribution of response times across different buckets (e.g., <10ms, 10-100ms, >10s) in 5-minute intervals.
    *   **Top Slow APIs/Queries Chart:** Bar chart highlighting APIs/queries with the highest average response times.
    *   **Most Frequent APIs/Queries Chart:** Bar chart showing the most frequently called APIs/queries.
*   **Detailed Slow Log Table:** A searchable and sortable table listing all requests that exceeded the 200ms threshold, including timestamp, target (URL/SQL), method, IP, and duration.
*   **CSV Export:** Download the detailed list of slow requests as a CSV file for further analysis.
*   **Responsive UI:** Built with Tailwind CSS for a clean, modern, and responsive user experience.

## Technologies Used

*   **Frontend:** React, TypeScript
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS
*   **Charting:** Recharts
*   **Icons:** Lucide React

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js (LTS version recommended)
*   npm or Yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/forFun_gram.git
    cd forFun_gram
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

### Running the Application

1.  Start the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
2.  Open your browser and navigate to `http://localhost:5173` (or the port indicated in your terminal).

## Usage

1.  **Select Log Type:** Choose the appropriate log format (MyBatis, Nginx, Tomcat, Logback) from the header.
2.  **Upload File:** Click the "파일 업로드" button and select your `.log` or `.txt` file.
3.  **View Analysis:** Once the file is processed, the dashboard will display a summary, charts, and a detailed table of slow requests.
4.  **Search & Sort:** Use the search bar to filter slow requests and click on table headers to sort.
5.  **Download CSV:** Click the download button in the "지연 시간 상세" section to export slow requests.

## Project Structure (Relevant Files)

*   `public/`: Static assets.
*   `src/main.tsx`: Main entry point for the React application, rendering the `LogAnalyzer` component.
*   `src/logAnalyzer.tsx`: The core component containing all the log processing logic, UI, and data visualization.
*   `index.html`: The main HTML file.
*   `package.json`: Project dependencies and scripts.
*   `vite.config.ts`: Vite build configuration.
*   `tailwind.config.js`: Tailwind CSS configuration.
*   `postcss.config.js`: PostCSS configuration.

## Contribution

Contributions are welcome! Please feel free to open issues or submit pull requests.

---

_Note: The `src/studytime_check.tsx` file appears to be a separate, unrelated application for study tracking and is not integrated into this Log Analyzer project._