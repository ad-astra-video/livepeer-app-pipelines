import React from 'react'
import { Grid, Box, Typography, useMediaQuery, useTheme } from '@mui/material'
import ImageCard from './ImageCard'

const ImageGallery = ({ images, toggleFavorite, newImageId }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'))

  return (
    <Box
      sx={{
        height: { xs: 'calc(100vh - 100px)', sm: 'calc(100vh - 120px)' }, // Adjusted height for mobile
        overflow: 'auto',
        pr: { xs: 0, sm: 1 }, // No padding on mobile, add padding for scrollbar on larger screens
        pl: { xs: 0, sm: 0 }, // No padding on mobile
        mx: { xs: 0, sm: 0 }, // Remove negative margin that was causing issues
        width: '100%', // Ensure full width
        // Custom scrollbar styling
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '4px',
          '&:hover': {
            background: 'rgba(0, 0, 0, 0.3)',
          },
        },
        // Firefox scrollbar styling
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
      }}
    >
      {images.length === 0 ? (
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '50vh',
            flexDirection: 'column',
            textAlign: 'center',
            p: 3
          }}
        >
          <Typography variant={isMobile ? "subtitle1" : "h6"} gutterBottom>No images generated yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Use the sidebar to generate your first image
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={isMobile ? 1 : 3} sx={{ p: { xs: 1, sm: 0 } }}>
          {images.map(image => (
            <Grid item xs={6} sm={6} md={4} lg={3} key={image.id}>
              <ImageCard 
                image={image} 
                toggleFavorite={toggleFavorite} 
                isNew={image.id === newImageId}
                isMobile={isMobile}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  )
}

export default ImageGallery
