import React, { useState } from "react";
import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { Link } from "react-router-dom";
import { HelpOutlined, HomeOutlined, MenuOutlined, Message } from "@mui/icons-material";
import { tokens } from "../../theme";

const Item = ({ title, to, icon, selected, setSelected, isCollapsed }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box
      component={Link}
      to={to}
      onClick={() => setSelected(title)}
      sx={{
        alignItems: "center",
        borderRadius: 1,
        color: selected === title ? "#6870fa" : colors.grey[100],
        display: "flex",
        gap: 1.5,
        justifyContent: isCollapsed ? "center" : "flex-start",
        minHeight: 40,
        px: isCollapsed ? 1 : 2,
        py: 0.75,
        textDecoration: "none",
        "&:hover": {
          color: "#868dfb",
        },
      }}
    >
      {icon}
      {!isCollapsed && <Typography>{title}</Typography>}
    </Box>
  );
};

const Sidebar1 = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selected, setSelected] = useState("Dashboard");

  return (
    <Box
      sx={{
        background: colors.primary[400],
        flexShrink: 0,
        minHeight: "100vh",
        transition: "width 180ms ease",
        width: isCollapsed ? 80 : 250,
      }}
    >
      <Box sx={{ p: 1.5 }}>
        <Box
          sx={{
            alignItems: "center",
            color: colors.grey[100],
            display: "flex",
            justifyContent: isCollapsed ? "center" : "space-between",
            mb: 2,
            mt: 1,
          }}
        >
          {!isCollapsed && (
            <Typography variant="h3" color={colors.grey[100]}>
              admin
            </Typography>
          )}
          <IconButton onClick={() => setIsCollapsed((collapsed) => !collapsed)} sx={{ color: colors.grey[100] }}>
            <MenuOutlined />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            pl: isCollapsed ? 0 : "10%",
          }}
        >
          <Item
            title="Doctors"
            to="/"
            icon={<HomeOutlined />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
          <Item
            title="Users"
            to="/Users"
            icon={<HelpOutlined />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
          <Item
            title="Enqiry"
            to="/Enquery"
            icon={<Message />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
          <Item
            title="Ambulance Service"
            to="/ambulance"
            icon={<Message />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
          <Item
            title="Add Doctor"
            to="/AddDoctor"
            icon={<Message />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
          <Item
            title="Chat"
            to="/chat"
            icon={<Message />}
            selected={selected}
            setSelected={setSelected}
            isCollapsed={isCollapsed}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default Sidebar1;
