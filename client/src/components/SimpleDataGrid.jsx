import React from "react";
import { Box, Typography } from "@mui/material";

export const GridOverlay = ({ children }) => (
  <Box
    sx={{
      alignItems: "center",
      color: "text.secondary",
      display: "flex",
      justifyContent: "center",
      minHeight: 160,
      width: "100%",
    }}
  >
    {children}
  </Box>
);

const formatValue = (value) => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value ?? "";
};

export const DataGrid = ({
  rows = [],
  columns = [],
  getRowId = (row) => row.id,
  components,
  slots,
  sx,
}) => {
  const NoRowsOverlay = slots?.noRowsOverlay || components?.NoRowsOverlay;
  const totalWidth = columns.reduce((sum, column) => sum + (column.width || 160), 0);

  const renderCell = (row, column) => {
    const value = row[column.field];
    const params = {
      id: getRowId(row),
      row,
      field: column.field,
      value,
      colDef: column,
    };

    if (column.renderCell) {
      return column.renderCell(params);
    }

    return formatValue(value);
  };

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        height: "100%",
        overflow: "hidden",
        width: "100%",
        ...sx,
      }}
    >
      {rows.length === 0 ? (
        NoRowsOverlay ? (
          <NoRowsOverlay />
        ) : (
          <GridOverlay>
            <Typography>No rows</Typography>
          </GridOverlay>
        )
      ) : (
        <Box sx={{ height: "100%", overflow: "auto" }}>
          <Box
            component="table"
            sx={{
              borderCollapse: "collapse",
              minWidth: totalWidth,
              tableLayout: "fixed",
              width: "100%",
            }}
          >
            <Box component="thead" sx={{ bgcolor: "action.hover" }}>
              <Box component="tr">
                {columns.map((column) => (
                  <Box
                    component="th"
                    key={column.field}
                    sx={{
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      fontWeight: 600,
                      px: 1.5,
                      py: 1,
                      textAlign: "left",
                      width: column.width || 160,
                    }}
                  >
                    {column.headerName || column.field}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((row) => (
                <Box component="tr" key={getRowId(row)}>
                  {columns.map((column) => (
                    <Box
                      component="td"
                      key={column.field}
                      sx={{
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        overflow: "hidden",
                        px: 1.5,
                        py: 1,
                        textOverflow: "ellipsis",
                        verticalAlign: "middle",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {renderCell(row, column)}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};
